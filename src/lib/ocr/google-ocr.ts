import { ImageAnnotatorClient } from "@google-cloud/vision";

let client: ImageAnnotatorClient | null = null;

function getClient(): ImageAnnotatorClient {
  if (client) return client;

  const key = process.env.GOOGLE_VISION_KEY;

  if (!key) {
    throw new Error("GOOGLE_VISION_KEY missing");
  }

  const credentials = JSON.parse(key);

  client = new ImageAnnotatorClient({
    credentials,
  });

  return client;
}

export async function runGoogleOCR(imageBuffer: Buffer) {
  const vision = getClient();

  const [result] = await vision.documentTextDetection({
    image: { content: imageBuffer },
  });

  const text = result.fullTextAnnotation?.text ?? "";

  return text;
}
