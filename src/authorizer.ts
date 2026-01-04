import {
  APIGatewayRequestAuthorizerEvent,
  APIGatewayAuthorizerResult,
} from "aws-lambda";
import jwt from "jsonwebtoken";

export async function handler(
  event: APIGatewayRequestAuthorizerEvent
): Promise<APIGatewayAuthorizerResult> {
  try {
    // console.log("Authorizer event: ", JSON.stringify(event, null, 2));

    const authHeader =
      event?.headers?.["Authorization"] ||
      event?.headers?.["authorization"] ||
      "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      throw new Error("Token missing");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!);

    const { role = "" } = decoded as { [key: string]: any };

    if (!role) {
      throw new Error("Invalid token: role missing");
    }

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
