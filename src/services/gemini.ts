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
  userApiKey?: string,
  retryCount = 0
): Promise<AnalysisResult> {
  const modelName = "gemini-3-flash-preview"; 
  
  // Robust key detection
  let apiKey = "";
  if (userApiKey && userApiKey.trim() !== "") {
    apiKey = userApiKey.trim();
  } else if (typeof process !== "undefined" && process.env && process.env.GEMINI_API_KEY) {
    apiKey = process.env.GEMINI_API_KEY.trim();
  } else if ((import.meta as any).env && (import.meta as any).env.VITE_GEMINI_API_KEY) {
    apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY.trim();
  }

  // Reject invalid or placeholder keys
  if (!apiKey || apiKey === "" || apiKey === "undefined" || apiKey === "null" || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error("Chưa có API Key! Hãy chọn Slot Key #1, #2, hoặc #3 trong Cài đặt và dán API Key vào.");
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
      Analyze the content of this file and suggest a concise, descriptive filename.
      
      SPECIAL INSTRUCTIONS for Petrolimex "LỆNH XUẤT KHO" or similar delivery orders:
      If you detect a Petrolimex delivery order, extract the following fields to create the filename:
      1. Date range: From "Từ ngày DD/MM/YYYY đến ngày DD/MM/YYYY", extract "DD.M-DD.M". 
         IMPORTANT: Use "." as day/month separator. Remove the leading zero from the MONTH if it starts with 0 (e.g., "08" becomes "8", "10" stays "10").
         Example: From "09/10/2023" to "15/10/2023", extract "09.10-15.10".
         Example: From "20/08/2023" to "26/08/2023", extract "20.8-26.8".
      2. License plate: Find "Số phương tiện" (e.g., 51C72125).
      3. Person name: Find "Người vận tải" (e.g., Nguyễn Văn Tuấn). Convert to uppercase without accents (e.g., NGUYEN VAN TUAN).
      4. Quantity: Find "Số lượng" (e.g., 3.000). Format as "Xk" where X is the number in thousands (e.g., 3k).
      5. Document ID: Find the 10-digit number usually located under the QR code (e.g., 2059080433).
      
      Format the suggestedName as: "[DateRange] [LicensePlate] [Name] [Quantity] [DocID]"
      Example final format: "20.8-26.8 62C03741 HO VAN VU 2k 2057732882"

      For other files, follow best practices (lowercase, hyphens instead of spaces).
      
      Also provide a brief summary of the content and extract any key metadata.
      
      Return the result in JSON format:
      {
        "suggestedName": "suggested-filename-without-extension",
        "summary": "Tóm tắt nội dung tại đây",
        "metadata": {
          "Key": "Value"
        }
      }
    `;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: modelName,
      contents: {
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
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text || "{}";
    const parsedResult = JSON.parse(text);
    
    return {
      suggestedName: parsedResult.suggestedName || "unnamed-file",
      summary: parsedResult.summary || "Không có tóm tắt",
      metadata: parsedResult.metadata || {},
    };
  } catch (e: any) {
    const errorMsg = e.message || "";
    // Robustly detect quota error (code 429)
    const isQuotaError = errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("QuotaExceeded");
    
    if (isQuotaError && retryCount < 5) {
      const waitTime = Math.pow(2, retryCount) * 4000 + Math.random() * 1000;
      console.warn(`Hết hạn mức (Quota), đang tự động thử lại sau ${Math.round(waitTime/1000)} giây... (Lần ${retryCount + 1})`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return analyzeFileContent(file, base64Data, mimeType, userApiKey, retryCount + 1);
    }

    console.error("Gemini API Error details:", e);
    
    if (errorMsg.includes("API key not valid")) {
      throw new Error("API Key không hợp lệ. Vui lòng kiểm tra lại mã đã dán.");
    }
    
    throw new Error(errorMsg || "Lỗi kết nối API Gemini. Hãy kiểm tra kết nối mạng và API Key.");
  }
}
