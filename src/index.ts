import { APIGatewayEvent } from "aws-lambda";
import createShortUrl from "./util/createShortUrl.js";
import { getUrl } from "./util/getOgUrl.js";

interface EventObject {
  methodType: "POST" | "GET";
  url?: string;
  shortId?: string;
}

const isAPIGatewayEvent = (
  event: EventObject | APIGatewayEvent
): event is APIGatewayEvent => {
  return "requestContext" in event;
};

export interface Response {
  statusCode: number;
  body: string;
  headers?: { [key: string]: string };
}

export const handler = async (
  event: EventObject | APIGatewayEvent
): Promise<Response> => {
  try {
    if (isAPIGatewayEvent(event)) {
      const baseUrl = `${event.headers["X-Forwarded-Proto"]}://${event.headers["Host"]}/${event.requestContext.stage}/urlApi/short/`;

      // console.log("Event received: ", JSON.stringify(event, null, 2));
      if (
        event.httpMethod === "POST" &&
        event.path === "/urlApi/get-url-shortener" &&
        event.body
      ) {
        const { url = "" } = JSON.parse(event.body);
        return await createShortUrl(url, baseUrl);
      } else if (
        event.httpMethod === "GET" &&
        /^\/urlApi\/short\/[A-Za-z0-9+/=]{7}$/.test(event.path)
      ) {
        const shortId = event?.pathParameters?.shortId || "";
        return await getUrl(shortId);
      }
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid HTTP request" }),
      };
    } else {
      if (event.methodType === "POST" && event.url) {
        const baseUrl = "https://skrt.in/";
        return await createShortUrl(event.url, baseUrl);
      } else if (event.methodType === "GET" && event.shortId) {
        return await getUrl(event.shortId);
      }
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid event type" }),
      };
    }
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};
