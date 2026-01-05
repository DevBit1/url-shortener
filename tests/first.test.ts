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
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import jwt from "jsonwebtoken";

const sendSpy = jest
  .spyOn(DynamoDBDocumentClient.prototype, "send")
  .mockImplementation(async () => Promise.resolve({}));

const jwtMock = jest.spyOn(jwt, "verify").mockImplementation(() => {
  return { role: "admin" } as any;
});

import { handler } from "../src/index.js";
import { handler as authorizerHandler } from "../src/authorizer.js";
import { APIGatewayRequestAuthorizerEvent } from "aws-lambda";

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
      if (!(command instanceof PutCommand)) {
        throw new Error("Invalid command type");
      }

      const input = command.input;

      if (!input.TableName) {
        throw new Error("Missing TableName");
      }

      if (!input.Item) {
        throw new Error("Missing Item");
      }

      if (!input.Item.shortId) {
        throw new Error("Missing required attribute: shortId (primary key)");
      }

      if (!input.Item.parentUrl) {
        throw new Error("Missing required attribute: parentUrl");
      }

      if (!input.Item.createdAt) {
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

  test("Rejects invalid HTTP method", async () => {
    const event = getApiProxyEvent("PUT", "/urlApi/get-url-shortener", "");

    const response = await handler(event as APIGatewayEvent);

    expect(response.statusCode).toBe(400);
    const responseBody = JSON.parse(response.body);
    expect(responseBody).toHaveProperty("message", "Invalid HTTP request");

    expect(sendSpy).not.toHaveBeenCalled();
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

  test("Handles Lambda events directly for POST", async () => {
    const testUrl = "https://example.com";
    const event = {
      methodType: "POST",
      url: testUrl,
    };

    const response = await handler(event as unknown as any);

    expect(response.statusCode).toBe(201);
    const responseBody = JSON.parse(response.body);
    expect(responseBody).toHaveProperty("shortUrl");
    expect(responseBody).toHaveProperty("message");

    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
});

describe("URL fetch Tests", () => {
  const testUrl = "https://example.com/very/long/url";

  beforeAll(() => {
    sendSpy.mockImplementation(async (command) => {
      if (!(command instanceof GetCommand)) {
        throw new Error("Invalid command type");
      }

      console.log("MOCK get: ", JSON.stringify(command, null, 2));

      const input = command.input;

      if (!input.TableName) {
        throw new Error("Missing TableName");
      }

      if (!input.Key || !input.Key.shortId) {
        throw new Error("Missing required Key attribute: shortId");
      }

      return {
        $metadata: { httpStatusCode: 200 },
        Item: {
          shortId: input.Key.shortId,
          parentUrl: testUrl,
        },
      };
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

  test("Handles Lambda events for GET", async () => {
    const event = {
      methodType: "GET",
      shortId: "abcdefg",
    };

    const response = await handler(event as unknown as any);

    expect(response.statusCode).toBe(301);
    expect(response.headers?.Location).toBe(testUrl);
  });
});

describe("Verify Authorizer", () => {
  const getAuthorizerEvent = (
    token = "",
    httpMethod = "GET",
    headerName = "Authorization"
  ): Partial<APIGatewayRequestAuthorizerEvent> =>
    ({
      type: "REQUEST",
      methodArn:
        "arn:aws:execute-api:us-east-1:123456789012:abcdef123/prod/GET/urlApi",
      headers: {
        [headerName]: token ? `Bearer ${token}` : "",
      },
      httpMethod,
    } as Partial<APIGatewayRequestAuthorizerEvent>);

  beforeEach(() => {
    jwtMock.mockClear();
  });

  test("Authorizer allows admin role", async () => {
    jwtMock.mockImplementationOnce(() => {
      return { role: "admin" } as any;
    });

    const event = getAuthorizerEvent(
      "valid-token"
    ) as APIGatewayRequestAuthorizerEvent;

    const result = await authorizerHandler(event);

    expect(result.policyDocument.Statement[0].Effect).toBe("Allow");
    expect(result.principalId).toBe("user");
    expect(jwtMock).toHaveBeenCalledTimes(1);
  });

  test("Authorizer allows GET request for user role", async () => {
    jwtMock.mockImplementationOnce(() => {
      return { role: "user" } as any;
    });

    const event = getAuthorizerEvent(
      "valid-token"
    ) as APIGatewayRequestAuthorizerEvent;

    const result = await authorizerHandler(event);

    expect(result.policyDocument.Statement[0].Effect).toBe("Allow");
    expect(result.principalId).toBe("user");
    expect(jwtMock).toHaveBeenCalledTimes(1);
  });

  test("Authorizer denies POST request for user role", async () => {
    jwtMock.mockImplementationOnce(() => {
      return { role: "user" } as any;
    });

    const event = getAuthorizerEvent(
      "valid-token"
    ) as APIGatewayRequestAuthorizerEvent;
    event.httpMethod = "POST";

    const result = await authorizerHandler(event);

    expect(result.policyDocument.Statement[0].Effect).toBe("Deny");
    expect(result.principalId).toBe("user");
  });

  test("Authorizer denies when token is missing", async () => {
    const event = getAuthorizerEvent("") as APIGatewayRequestAuthorizerEvent;

    const result = await authorizerHandler(event);

    expect(result.policyDocument.Statement[0].Effect).toBe("Deny");
    expect(jwtMock).not.toHaveBeenCalled();
  });

  test("Authorizer denies when Authorization header is missing", async () => {
    const event = {
      type: "REQUEST",
      methodArn:
        "arn:aws:execute-api:us-east-1:123456789012:abcdef123/prod/GET/urlApi",
      headers: {},
    } as APIGatewayRequestAuthorizerEvent;

    const result = await authorizerHandler(event);

    expect(result.policyDocument.Statement[0].Effect).toBe("Deny");
    expect(jwtMock).not.toHaveBeenCalled();
  });

  test("Authorizer denies when token verification fails", async () => {
    jwtMock.mockImplementationOnce(() => {
      throw new Error("Invalid token");
    });

    const event = getAuthorizerEvent(
      "invalid-token"
    ) as APIGatewayRequestAuthorizerEvent;

    const result = await authorizerHandler(event);

    expect(result.policyDocument.Statement[0].Effect).toBe("Deny");
    expect(jwtMock).toHaveBeenCalledTimes(1);
  });

  test("Authorizer denies when role is missing from token", async () => {
    jwtMock.mockImplementationOnce(() => {
      return { sub: "user123" } as any;
    });

    const event = getAuthorizerEvent(
      "valid-token"
    ) as APIGatewayRequestAuthorizerEvent;

    const result = await authorizerHandler(event);

    expect(result.policyDocument.Statement[0].Effect).toBe("Deny");
    expect(jwtMock).toHaveBeenCalledTimes(1);
  });

  test("Authorizer denies when role is invalid", async () => {
    jwtMock.mockImplementationOnce(() => {
      return { role: "invalid-role" } as any;
    });

    const event = getAuthorizerEvent(
      "valid-token"
    ) as APIGatewayRequestAuthorizerEvent;

    const result = await authorizerHandler(event);

    expect(result.policyDocument.Statement[0].Effect).toBe("Deny");
    expect(jwtMock).toHaveBeenCalledTimes(1);
  });

  test("Authorizer denies empty role string", async () => {
    jwtMock.mockImplementationOnce(() => {
      return { role: "" } as any;
    });

    const event = getAuthorizerEvent(
      "valid-token"
    ) as APIGatewayRequestAuthorizerEvent;

    const result = await authorizerHandler(event);

    expect(result.policyDocument.Statement[0].Effect).toBe("Deny");
  });

  test("Authorizer returns correct policy structure", async () => {
    jwtMock.mockImplementationOnce(() => {
      return { role: "admin" } as any;
    });

    const event = getAuthorizerEvent(
      "valid-token"
    ) as APIGatewayRequestAuthorizerEvent;

    const result = await authorizerHandler(event);

    expect(result).toHaveProperty("principalId");
    expect(result).toHaveProperty("policyDocument");
    expect(result.policyDocument).toHaveProperty("Version");
    expect(result.policyDocument.Version).toBe("2012-10-17");
    expect(result.policyDocument).toHaveProperty("Statement");
    expect(Array.isArray(result.policyDocument.Statement)).toBe(true);
  });
});
