import {
  jest,
  describe,
  test,
  expect,
  beforeEach,
  beforeAll,
} from "@jest/globals";
import { APIGatewayEvent } from "aws-lambda";
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";

const sendSpy = jest
  .spyOn(DynamoDBClient.prototype, "send")
  .mockImplementation(async () => Promise.resolve({}));

import { handler } from "../src/index.js";

const getApiProxyEvent = (
  method = "POST",
  path = "/urlApi",
  body = "",
  pathParameters = {}
): Partial<APIGatewayEvent> =>
  ({
    httpMethod: method.toUpperCase(),
    path: path,
    headers: {
      "X-Forwarded-Proto": "https",
      Host: "example.com",
    },
    body: body,
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: {},
    pathParameters: pathParameters,
    queryStringParameters: {},
    stageVariables: {},
    requestContext: {
      accountId: "123456789012",
      stage: "dev",
    } as any,
  } as Partial<APIGatewayEvent>);

describe("URL Shortener creation Tests", () => {
  beforeAll(() => {
    sendSpy.mockImplementation(async (command) => {
      if (!(command instanceof PutItemCommand)) {
        throw new Error("Invalid command type");
      }

      const input = command.input;

      if (!input.TableName) {
        throw new Error("Missing TableName");
      }

      if (!input.Item) {
        throw new Error("Missing Item");
      }

      if (!input.Item.shortId || !input.Item.shortId.S) {
        throw new Error("Missing required attribute: shortId (primary key)");
      }

      if (!input.Item.parentUrl || !input.Item.parentUrl.S) {
        throw new Error("Missing required attribute: parentUrl");
      }

      if (!input.Item.createdAt || !input.Item.createdAt.S) {
        throw new Error("Missing required attribute: createdAt");
      }

      return { $metadata: { httpStatusCode: 200 } };
    });
  });

  beforeEach(() => {
    sendSpy.mockClear();
  });

  test("Handler exists", () => {
    expect(handler).toBeDefined();
  });

  test("Handler sends correct DynamoDB item structure", async () => {
    const testUrl = "https://example.com";
    const event = getApiProxyEvent(
      "POST",
      "/urlApi/get-url-shortener",
      JSON.stringify({ url: testUrl })
    );

    const response = await handler(event as APIGatewayEvent);

    expect(response.statusCode).toBe(201);
    const responseBody = JSON.parse(response.body);
    expect(responseBody).toHaveProperty("shortUrl");
    expect(responseBody).toHaveProperty("message");

    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  test("Handler rejects invalid URL", async () => {
    const event = getApiProxyEvent(
      "POST",
      "/urlApi/get-url-shortener",
      JSON.stringify({ url: "not-a-valid-url" })
    );

    const response = await handler(event as APIGatewayEvent);

    expect(response.statusCode).toBe(400);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  test("Handler rejects missing URL", async () => {
    const event = getApiProxyEvent(
      "POST",
      "/urlApi/get-url-shortener",
      JSON.stringify({})
    );

    const response = await handler(event as APIGatewayEvent);

    expect(response.statusCode).toBe(400);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});

describe("URL fetch Tests", () => {
  beforeAll(() => {
    sendSpy.mockImplementation(async (command) => {
      if (!(command instanceof GetItemCommand)) {
        throw new Error("Invalid command type");
      }

      console.log("MOCK get: ", JSON.stringify(command, null, 2));

      const input = command.input;

      if (!input.TableName) {
        throw new Error("Missing TableName");
      }

      if (!input.Key || !input.Key.shortId || !input.Key.shortId.S) {
        throw new Error("Missing required Key attribute: shortId");
      }

      return { $metadata: { httpStatusCode: 200 } };
    });
  });

  beforeEach(() => {
    sendSpy.mockClear();
  });

  test("Handler exists", () => {
    expect(handler).toBeDefined();
  });

  test("Handler returns 400 for missing shortId", async () => {
    const event = getApiProxyEvent("GET", "/urlApi/short/abcdefg", "", {});

    const response = await handler(event as APIGatewayEvent);

    expect(response.statusCode).toBe(400);
    const responseBody = JSON.parse(response.body);

    expect(responseBody).toHaveProperty("message", "Short ID is required");

    expect(sendSpy).not.toHaveBeenCalled();
  });

  test("Handler returns 404 for non-existent shortId", async () => {
    sendSpy.mockImplementationOnce(async (command) => {
      return {}; // Simulate no item found
    });

    const event = getApiProxyEvent("GET", "/urlApi/short/abcdefg", "", {
      shortId: "abcdefg",
    });

    const response = await handler(event as APIGatewayEvent);

    expect(response.statusCode).toBe(404);
    const responseBody = JSON.parse(response.body);
    expect(responseBody).toHaveProperty("message", "Short URL not found");

    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  test("Handler returns 301 for successful fetch with correct response format", async () => {
    const testUrl = "https://example.com/very/long/url";
    sendSpy.mockImplementationOnce(async (command) => {
      return {
        Item: {
          shortId: { S: "abcdefg" },
          parentUrl: { S: testUrl },
        },
      };
    });

    const event = getApiProxyEvent("GET", "/urlApi/short/abcdefg", "", {
      shortId: "abcdefg",
    });

    const response = await handler(event as APIGatewayEvent);

    expect(response.statusCode).toBe(301);
    expect(response.headers).toBeDefined();
    expect(response.headers?.Location).toBe(testUrl);

    const responseBody = JSON.parse(response.body);
    expect(responseBody).toHaveProperty("parentUrl", testUrl);

    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
});
