import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { Response } from "../index.js";

const client = new DynamoDBClient({ region: "ap-south-1" });
const docClient = DynamoDBDocumentClient.from(client);

abstract class ShortUrl {
  abstract shortId: string;
  abstract parentUrl: string;
  protected abstract generateCode(length: number): string;
}

class ShortUrlImpl extends ShortUrl {
  shortId: string;
  parentUrl: string;
  createdAt: string;

  protected generateCode = (length: number): string => {
    const chars =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";

    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return result;
  };

  constructor(parentUrl: string) {
    super();
    this.shortId = this.generateCode(7);
    this.parentUrl = parentUrl;
    this.createdAt = new Date().toISOString();
  }
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

    const shortUrlObj = new ShortUrlImpl(url);
    const shortUrl = baseUrl + shortUrlObj.shortId;

    const command = new PutCommand({
      TableName: process.env.TABLE_NAME || "url-shortener-skr",
      Item: shortUrlObj,
      ConditionExpression: "attribute_not_exists(shortId)",
    });

    await docClient.send(command);

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
    console.error("Error: ", error);
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
