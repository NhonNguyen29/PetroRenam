import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

export interface AnalysisResult {
  suggestedName: string;
  summary: string;
  metadata: Record<string, string>;
}

export async function analyzeFileContent(
  file: File,
  base64Data: string,
  mimeType: string,
  userApiKey?: string
): Promise<AnalysisResult> {
  const model = "gemini-3-flash-preview"; 
  const apiKey = userApiKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Gemini API Key is missing. Please configure it in the Settings panel.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    Analyze the content of this file and suggest a concise, descriptive filename.
    
    SPECIAL INSTRUCTIONS for Petrolimex "LỆNH XUẤT KHO" or similar delivery orders:
    If you detect a Petrolimex delivery order, extract the following fields to create the filename:
    1. Date range: From "Từ ngày DD/MM/YYYY đến ngày DD/MM/YYYY", extract "DD-DD" (e.g., 09-15).
    2. License plate: Find "Số phương tiện" (e.g., 51C72125).
    3. Person name: Find "Người vận tải" (e.g., Nguyễn Văn Tuấn). Convert to uppercase without accents if possible, or just uppercase.
    4. Quantity: Find "Số lượng" (e.g., 3.000). Format as "Xk" where X is the number in thousands (e.g., 3k).
    5. Document ID: Find the 10-digit number usually located under the QR code (e.g., 2059080433).
    
    Format the suggestedName as: "[DD-DD] [LicensePlate] [Name] [Quantity] [DocID]"
    Example: "09-15 51C72125 NGUYEN VAN TUAN 3k 2059080433"

    For other files, follow best practices (lowercase, hyphens instead of spaces).
    
    Also provide a brief summary of the content and extract any key metadata.
    
    Return the result in JSON format:
    {
      "suggestedName": "suggested-filename-without-extension",
      "summary": "Brief summary here",
      "metadata": {
        "Key": "Value"
      }
    }
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    const result = JSON.parse(response.text || "{}");
    return {
      suggestedName: result.suggestedName || "unnamed-file",
      summary: result.summary || "No summary available",
      metadata: result.metadata || {},
    };
  } catch (e: any) {
    console.error("Gemini API Error:", e);
    throw new Error(e.message || "Failed to call the Gemini API. Please try again.");
  }
}
