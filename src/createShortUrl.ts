import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({ region: "ap-south-1" });

export default function generateShortCode(length = 7) {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}

interface EventObject {
  methodType: "CREATE" | "GET";
  url?: string;
  shortId?: string;
}

interface HttpEventObject {
  path: string;
  headers: Record<string, string>;
  body?: string;
  queryStringParameters?: Record<string, string>;
  pathParameters?: Record<string, string>;
  requestContext: Record<string, any>;
  httpMethod: string;
}

const isHttpRequest = (
  event: EventObject | HttpEventObject
): event is HttpEventObject => {
  return "requestContext" in event;
};

export interface Response {
  statusCode: number;
  body: string;
  headers?: { [key: string]: string };
}

export const mainFunction = async (
  event: EventObject | HttpEventObject
): Promise<Response> => {
  let url: string = "";
  let baseUrl: string = "";
  console.log(
    "Event received in createShortUrl: ",
    JSON.stringify(event, null, 2)
  );
  console.log("\n\n------------------------------------\n")
  try {
    if (isHttpRequest(event)) {
      baseUrl = `${event.headers["X-Forwarded-Proto"]}://${event.headers["Host"]}/${event.requestContext.stage}/urlApi/short/`;
      url = JSON.parse(event?.body || "")?.url || "";
    } else {
      baseUrl = "https://skrt.in/";
      url = event.url || "";
    }

    if (!url || typeof url !== "string") {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "URL is required and must be a string",
        }),
      };
    }

    try {
      new URL(url);
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid URL format" }),
      };
    }

    const shortId = generateShortCode();
    const shortUrl = baseUrl + shortId;

    console.log("Generated short ID: ", shortId);
    console.log("Full short URL: ", shortUrl);

    const command = new PutItemCommand({
      TableName: process.env.TABLE_NAME || "url-shortener-skr",
      Item: {
        shortId: { S: shortId },
        parentUrl: { S: url },
        createdAt: { S: new Date().toISOString() },
      },
      ConditionExpression: "attribute_not_exists(shortId)",
    });

    console.log("Putting item with command: ", JSON.stringify(command, null, 2));

    await client.send(command);

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Short URL created successfully",
        shortUrl,
      }),
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "ConditionalCheckFailedException"
    ) {
      return mainFunction(event);
    }
    console.log("Error creating short URL: ", JSON.stringify(error, null, 2));
    const statusCode = (error as any)?.$metadata?.httpStatusCode || 500;
    const message =
      error instanceof Error ? error.message : "Failed to create short URL";
    return {
      statusCode: statusCode,
      body: JSON.stringify({
        message: message,
      }),
    };
  }
};
