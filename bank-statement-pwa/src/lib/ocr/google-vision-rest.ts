export type GoogleVisionFeature =
  | "DOCUMENT_TEXT_DETECTION"
  | "TEXT_DETECTION";

type VisionAnnotateResponse = {
  responses?: Array<{
    fullTextAnnotation?: { text?: string };
    textAnnotations?: Array<{ description?: string }>;
    error?: { message?: string };
  }>;
};

export async function googleVisionOcrFromImageBase64(params: {
  base64: string;              // image bytes as base64 (no data: prefix)
  feature?: GoogleVisionFeature;
}): Promise<{ text: string }> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) throw new Error("Missing GOOGLE_VISION_API_KEY");

  const feature = params.feature ?? "DOCUMENT_TEXT_DETECTION";

  const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`;

  const body = {
    requests: [
      {
        image: { content: params.base64 },
        features: [{ type: feature }],
      },
    ],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Vision API error (${res.status}): ${msg}`);
  }

  const data = (await res.json()) as VisionAnnotateResponse;

  const first = data.responses?.[0];
  const apiError = first?.error?.message;
  if (apiError) throw new Error(`Vision API response error: ${apiError}`);

  // Prefer fullTextAnnotation (best for documents)
  const text =
    first?.fullTextAnnotation?.text ??
    first?.textAnnotations?.[0]?.description ??
    "";

  return { text };
}
