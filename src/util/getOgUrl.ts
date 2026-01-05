import { GetItemCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { Response } from "../index.js";

const client = new DynamoDBClient({ region: "ap-south-1" });
const docClient = DynamoDBDocumentClient.from(client);

export async function getUrl(shortId: string): Promise<Response> {
  try {
    if (!shortId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Short ID is required" }),
      };
    }

    const command = new GetCommand({
      TableName: process.env.TABLE_NAME || "url-shortener-skr",
      Key: {
        shortId,
      },
    });

    const response = await docClient.send(command);


    if (response.Item && response.Item.parentUrl) {
      return {
        statusCode: 301,
        body: JSON.stringify({ parentUrl: response.Item.parentUrl }),
        headers: {
          Location: response.Item.parentUrl,
        },
      };
    } else {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Short URL not found" }),
      };
    }
  } catch (error) {
    console.error("Error for get command: ", error);
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
}
