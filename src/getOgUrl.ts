import { GetItemCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({ region: "ap-south-1" });

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

export interface Response {
  statusCode: number;
  body: string;
  headers?: { [key: string]: string };
}

const isHttpRequest = (
  event: EventObject | HttpEventObject
): event is HttpEventObject => {
  return "requestContext" in event;
};

export const mainFunction = async (
  event: EventObject | HttpEventObject
): Promise<Response> => {
  try {
    let shortId: string = "";
    if (isHttpRequest(event)) {
      shortId = event.pathParameters?.shortId || "";
    } else {
      shortId = event.shortId || "";
    }

    if (!shortId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Short ID is required" }),
      };
    }

    const command = new GetItemCommand({
      TableName: process.env.TABLE_NAME || "url-shortener-skr",
      Key: {
        shortId: { S: shortId },
      },
    });

    const response = await client.send(command);

    if (response.Item && response.Item.parentUrl && response.Item.parentUrl.S) {
      return {
        statusCode: 301,
        body: JSON.stringify({ parentUrl: response.Item.parentUrl.S }),
        headers: {
          Location: response.Item.parentUrl.S,
        },
      };
    } else {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Short URL not found" }),
      };
    }
  } catch (error) {
    console.log("Error retrieving parent URL: ", JSON.stringify(error));
    const statusCode = (error as any)?.$metadata?.httpStatusCode || 500;
    const message =
      error instanceof Error ? error.message : "Failed to retrieve parent URL";
    return {
      statusCode: statusCode,
      body: JSON.stringify({
        message: message,
      }),
    };
  }
};
