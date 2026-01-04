import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { Response } from "../index.js";

const client = new DynamoDBClient({ region: "ap-south-1" });

export function generateShortCode(length = 7) {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}

export default async function createShortUrl(
  url: string,
  baseUrl: string
): Promise<Response> {
  try {
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

    // console.log(
    //   "Putting item with command: ",
    //   JSON.stringify(command, null, 2)
    // );

    console.log("Sending PutItemCommand to DynamoDB", await client.send(command));

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
      return createShortUrl(url, baseUrl);
    }
    console.error("Error: ", error)
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
}
