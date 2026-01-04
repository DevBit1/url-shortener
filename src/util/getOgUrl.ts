import { GetItemCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { Response } from "../index.js";

const client = new DynamoDBClient({ region: "ap-south-1" });

export async function getUrl(shortId: string): Promise<Response> {
  try {
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

    console.log("DynamoDB GetItem response: ", JSON.stringify(response, null, 2));

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
    console.error("Error for get command: ", error)
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
}
