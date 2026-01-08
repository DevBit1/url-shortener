import {
  APIGatewayRequestAuthorizerEvent,
  APIGatewayAuthorizerResult,
} from "aws-lambda";
import jwt from "jsonwebtoken";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const secretsManagerClient = new SecretsManagerClient({
  region: "ap-south-1",
});

const command = new GetSecretValueCommand({
  SecretId: process.env.SECRET_NAME!,
});

export async function handler(
  event: APIGatewayRequestAuthorizerEvent
): Promise<APIGatewayAuthorizerResult> {
  try {
    const authHeader =
      event?.headers?.["Authorization"] ||
      event?.headers?.["authorization"] ||
      "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      throw new Error("Token missing");
    }

    console.log("Token: ", token);
    console.log("Secret name: ", process.env.SECRET_NAME);
    console.log("Secret ARN: ", process.env.SECRET_ARN);
    console.log("Command: ", command);

    const secretResponse = await secretsManagerClient.send(command);

    console.log("Secret response: ", secretResponse);

    const { JWT_SECRET = "" } = JSON.parse(secretResponse.SecretString || "{}");

    if (!JWT_SECRET) {
      throw new Error("JWT_SECRET not found");
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    let { role = "" } = decoded as { [key: string]: any };

    if (!role) {
      throw new Error("Invalid token: role missing");
    }

    role = role.toLowerCase();

    if (role === "admin") {
      return {
        principalId: "user",
        policyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: "execute-api:Invoke",
              Resource: event.methodArn,
            },
          ],
        },
      };
    } else if (role === "user") {
      return {
        principalId: "user",
        policyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: event?.httpMethod === "GET" ? "Allow" : "Deny",
              Action: "execute-api:Invoke",
              Resource: event.methodArn,
            },
          ],
        },
      };
    }

    throw new Error("Invalid role in token");
  } catch (error) {
    console.error("Authorization error: ", error);
    return {
      principalId: "user",
      policyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Deny",
            Action: "execute-api:Invoke",
            Resource: event.methodArn,
          },
        ],
      },
    };
  }
}
