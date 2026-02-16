import { googleVisionOcrFromImageBase64 } from "@/lib/ocr/google-vision-rest";

export async function runGoogleOCR(imageBuffer: Buffer): Promise<string> {
  const { text } = await googleVisionOcrFromImageBase64({
    base64: imageBuffer.toString("base64"),
    feature: "DOCUMENT_TEXT_DETECTION",
  });

  return text;
}
