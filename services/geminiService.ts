import { GoogleGenAI, Type } from "@google/genai";
import { GenerationSettings, AISuggestions, AIConceptAnalysis, CameraSettings, PropConfig } from "../types";

// --- CÁC HÀM CHO CÁC MODE CŨ ---
export const getAiSuggestions = async (settings: { productName: string, visualStyle: string, techDescription?: string }): Promise<AISuggestions> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let styleContext = settings.visualStyle === "TECH_PS" ? `Phong cách "Ảnh USP Kỹ thuật".` : `Phong cách cơ bản.`;
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Gợi ý cho: "${settings.productName}". ${styleContext}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            concepts: { type: Type.ARRAY, items: { type: Type.STRING } },
            locations: { type: Type.ARRAY, items: { type: Type.STRING } },
            props: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["concepts", "locations", "props"]
        }
      }
    });
    return JSON.parse(response.text || "{}") as AISuggestions;
  } catch (e) { return { concepts: [], locations: [], props: [] }; }
};

// 1. Phân tích Concept (Lifestyle) - CẬP NHẬT ĐỂ NHẬN ẢNH THAM KHẢO
export const analyzeConceptAndCamera = async (productName: string, dimensions: string, images: string[], refImage: string | null): Promise<AIConceptAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const prompt = `
      Bạn là một giám đốc sáng tạo nhiếp ảnh sản phẩm chuyên nghiệp.
      Sản phẩm: "${productName}". Kích thước: ${dimensions}.
      ${refImage ? "Tôi có gửi kèm một ảnh mẫu phong cách (Style Reference). Hãy dựa vào style của ảnh này để đề xuất." : ""}
      
      YÊU CẦU:
      1. Đề xuất 5 Ý tưởng (Concept) chụp ảnh Lifestyle độc đáo, sang trọng.
      2. Đề xuất bộ thông số Camera (Góc chụp, tiêu cự, khẩu độ, ISO) lý tưởng nhất.

      Trả về JSON.
    `;

    const parts: any[] = [{ text: prompt }];
    images.forEach(img => parts.push({ inlineData: { data: img.split(',')[1], mimeType: 'image/png' } }));
    if (refImage) {
      parts.push({ inlineData: { data: refImage.split(',')[1], mimeType: 'image/png' } });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview", 
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            concepts: { type: Type.ARRAY, items: { type: Type.STRING } },
            suggestedCamera: {
              type: Type.OBJECT,
              properties: {
                angle: { type: Type.NUMBER },
                focalLength: { type: Type.NUMBER },
                aperture: { type: Type.STRING },
                iso: { type: Type.STRING },
                isMacro: { type: Type.BOOLEAN }
              },
              required: ["angle", "focalLength", "aperture", "iso", "isMacro"]
            }
          },
          required: ["concepts", "suggestedCamera"]
        }
      }
    });

    return JSON.parse(response.text || "{}") as AIConceptAnalysis;
  } catch (error: any) {
    if (error.message?.includes("Requested entity was not found")) throw new Error("AUTH_ERROR");
    throw error;
  }
};

// 2. Phân tích Tech USP
export const analyzeTechConceptAndCamera = async (productName: string, techDesc: string, dimensions: string, images: string[]): Promise<AIConceptAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const prompt = `Phân tích kỹ thuật cho: "${productName}". Tính năng: "${techDesc}". Kích thước: ${dimensions}. Trả về JSON 5 concept và camera.`;
    const parts: any[] = [{ text: prompt }];
    images.forEach(img => parts.push({ inlineData: { data: img.split(',')[1], mimeType: 'image/png' } }));

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            concepts: { type: Type.ARRAY, items: { type: Type.STRING } },
            suggestedCamera: {
              type: Type.OBJECT,
              properties: {
                angle: { type: Type.NUMBER }, focalLength: { type: Type.NUMBER }, aperture: { type: Type.STRING }, iso: { type: Type.STRING }, isMacro: { type: Type.BOOLEAN }
              },
              required: ["angle", "focalLength", "aperture", "iso", "isMacro"]
            }
          },
          required: ["concepts", "suggestedCamera"]
        }
      }
    });
    return JSON.parse(response.text || "{}") as AIConceptAnalysis;
  } catch (error: any) { throw error; }
};

// 3. Gợi ý Props cho Concept Lifestyle
export const suggestPropsForConcept = async (productName: string, concept: string): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Sản phẩm: ${productName}. Concept: "${concept}". Liệt kê 10 đạo cụ (props) trang trí phù hợp nhất. JSON array string.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { props: { type: Type.ARRAY, items: { type: Type.STRING } } }
        }
      }
    });
    return JSON.parse(response.text || "{}").props || [];
  } catch (error) { return []; }
};

// 4. Gợi ý Visual Elements cho Tech USP
export const suggestTechVisuals = async (productName: string, concept: string): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Sản phẩm: ${productName}. Tech Concept: "${concept}". Liệt kê 10 hiệu ứng đồ họa/visual elements. JSON array string.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { props: { type: Type.ARRAY, items: { type: Type.STRING } } }
        }
      }
    });
    return JSON.parse(response.text || "{}").props || [];
  } catch (error) { return []; }
};

// 5. Gợi ý Tech Concepts cho Hiệu ứng mặt biển
export const suggestTechConcepts = async (productName: string, title: string): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Sản phẩm: ${productName}, Tiêu đề: ${title}. Mô tả 3 ý tưởng hiển thị trên mặt nước biển đêm (văn xuôi, chi tiết). JSON array.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { concepts: { type: Type.ARRAY, items: { type: Type.STRING } } }
        }
      }
    });
    return JSON.parse(response.text || "{}").concepts || [];
  } catch (error) { return []; }
};

// 6. Phân tích phối cảnh staging
export const analyzeStagingScene = async (concept: string, realSceneImg: string, refStyleImg: string): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const prompt = `Phân tích trang trí phối cảnh. Concept: "${concept}". Trả về JSON 10 vật phẩm trang trí thêm vào phòng.`;
    const parts: any[] = [
      { text: prompt },
      { inlineData: { data: realSceneImg.split(',')[1], mimeType: 'image/png' } },
      { inlineData: { data: refStyleImg.split(',')[1], mimeType: 'image/png' } }
    ];
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { items: { type: Type.ARRAY, items: { type: Type.STRING } } }
        }
      }
    });
    return JSON.parse(response.text || "{}").items || [];
  } catch (error) { return []; }
};

// 7. Phân tích Concept Studio (Mới)
export const analyzeStudioConcept = async (productName: string, dimensions: string, images: string[]): Promise<AIConceptAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const prompt = `
      Bạn là một giám đốc sáng tạo nhiếp ảnh sản phẩm chuyên nghiệp.
      Sản phẩm: "${productName}". Kích thước: ${dimensions}.
      
      YÊU CẦU ĐẶC BIỆT CHO STUDIO CONCEPT:
      1. Đề xuất 5 Ý tưởng (Concept) chụp ảnh Studio phong phú và đa dạng (ví dụ: tối giản, hiện đại, hình học, ánh sáng kịch tính, v.v.).
      2. MÔ TẢ MẠCH LẠC, DỄ HÌNH DUNG: Mỗi concept cần được mô tả rõ ràng, súc tích. Tập trung miêu tả cụ thể về tông màu chủ đạo, cách đánh sáng (lighting) và cảm giác/không khí (vibe) mang lại. Không cần quá dài dòng nhưng phải mạch lạc để người đọc dễ dàng tưởng tượng ra bức ảnh.
      3. RÀNG BUỘC BẮT BUỘC:
         - Hình ảnh chụp trên nền giấy trơn 1 màu (Plain Paper Background).
         - Màu nền là màu Pastel tinh tế, HÀI HÒA hoặc ĐỒNG ĐIỆU với sản phẩm.
         - Sản phẩm và đạo cụ nằm gọn trong khung hình.
         - Chừa khoảng trống trên nền để chèn chữ (Text).
      4. Đề xuất bộ thông số Camera (Góc chụp, tiêu cự, khẩu độ, ISO) lý tưởng nhất cho Studio.

      Trả về JSON với 5 concepts và suggestedCamera.
    `;

    const parts: any[] = [{ text: prompt }];
    images.forEach(img => parts.push({ inlineData: { data: img.split(',')[1], mimeType: 'image/png' } }));

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview", 
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            concepts: { type: Type.ARRAY, items: { type: Type.STRING } },
            suggestedCamera: {
              type: Type.OBJECT,
              properties: {
                angle: { type: Type.NUMBER },
                focalLength: { type: Type.NUMBER },
                aperture: { type: Type.STRING },
                iso: { type: Type.STRING },
                isMacro: { type: Type.BOOLEAN }
              },
              required: ["angle", "focalLength", "aperture", "iso", "isMacro"]
            }
          },
          required: ["concepts", "suggestedCamera"]
        }
      }
    });

    return JSON.parse(response.text || "{}") as AIConceptAnalysis;
  } catch (error: any) {
    if (error.message?.includes("Requested entity was not found")) throw new Error("AUTH_ERROR");
    throw error;
  }
};

// Bước cuối: Tạo Prompt và Tạo Ảnh
export const generateProductImage = async (settings: GenerationSettings, variantSeed: number): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let finalPrompt = "";
  
  const formatProps = (props: PropConfig[]) => {
    return props.map(p => {
      let desc = p.name;
      const details = [];
      if (p.size && p.size !== 'auto') details.push(`size: ${p.size}`);
      if (p.position && p.position !== 'auto') details.push(`position: ${p.position}`);
      if (p.rotation && p.rotation !== 'auto') details.push(`rotation: ${p.rotation}`);
      if (details.length > 0) desc += ` (${details.join(', ')})`;
      return desc;
    }).join(", ");
  };
  
  if (settings.visualStyle === "SCENE_STAGING") {
    finalPrompt = `Staging professional: Add ${formatProps(settings.props)} into the real scene image following style "${settings.concept}". Keep original furniture. 8k, realistic.`;
  } else if (settings.visualStyle === "TECH_EFFECTS") {
    if (settings.techEffectType === "REMOVE_SIGNATURE") {
      finalPrompt = `Remove watermark/text from this image. Keep high quality, clear, bright.`;
    } else {
      finalPrompt = `Ocean night cinemetic. Product ${settings.productName}. Text "${settings.techTitle}". ${settings.selectedTechConcept}. Neon reflections, 8k.`;
    }
  } else if (settings.visualStyle === "PACKAGING_MOCKUP") {
    finalPrompt = `3D Packaging Mockup for ${settings.productName}. ${settings.packagingOutputStyle === 'WHITE_BG_ROTATED' ? 'White background studio' : 'Contextual lifestyle'}. 8k resolution.`;
  } else if (settings.visualStyle === "WHITE_BG_RETOUCH") {
    const qualityDescriptor = settings.imageSize === '4K' ? 'Ultra-High 4K Resolution, Hyper-detailed textures' : settings.imageSize === '2K' ? 'High Quality 2K Resolution, Sharp details' : 'Standard 1K Resolution, Clean finish';
    finalPrompt = `
      Professional e-commerce digital photography of '${settings.productName}'. 
      Visual Style: Digital high-end DSLR/Mirrorless camera capture aesthetic.
      Background: Recreate the image with the product isolated on a flawless, perfectly pure white background (#FFFFFF).
      Material characteristics: ${settings.productMaterial}.
      Retouching task: Professional studio retouching. Clean reflections, remove imperfections, enhance surface texture realism.
      Additional instructions: ${settings.concept || 'Maintain original product appearance with enhanced lighting.'}.
      Lighting: Professional studio lighting setup with accurate color reproduction.
      Shadows: Include a very subtle, natural contact shadow beneath the product to ground it realistically.
      Output Quality: ${qualityDescriptor}, 8k fidelity.
    `;
  } else if (settings.visualStyle === "CONCEPT" || settings.visualStyle === "TECH_PS") {
    const thinkingPrompt = `Write a detailed image generation prompt (English) for ${settings.productName}. Concept: ${settings.concept}. Props: ${formatProps(settings.props)}. Camera: ${settings.camera.focalLength}mm, ${settings.camera.aperture}. 8k high quality. Seed: ${variantSeed}.`;
    const thinkingResponse = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: thinkingPrompt,
      config: { thinkingConfig: { thinkingBudget: 1024 } }
    });
    finalPrompt = thinkingResponse.text || "";
  } else if (settings.visualStyle === "COLOR_CHANGE") {
    const colorDetails = settings.colorChanges.map(c => {
      let detail = `${c.partName}: `;
      if (c.pantoneCode) detail += `Pantone ${c.pantoneCode}, `;
      if (c.description) detail += `${c.description}, `;
      if (c.sampleImage) detail += `refer to the provided color sample image for this part, `;
      return detail.trim().replace(/,$/, '');
    }).join("; ");

    finalPrompt = `
      Change the color of the ${settings.productName} according to these specifications:
      ${colorDetails}.
      IMPORTANT: Maintain all original textures, labels, and material properties (e.g., metallic, matte, glossy). 
      The lighting and environment from the original image should be preserved.
      Output: High-fidelity, realistic color modification, 8k resolution.
    `;
  } else if (settings.visualStyle === "STUDIO") {
    const spaceMap: Record<string, string> = {
      "TOP": "top",
      "BOTTOM": "bottom",
      "LEFT": "left side",
      "RIGHT": "right side",
      "NONE": ""
    };
    
    const selectedSpaces = settings.emptySpacePosition
      .filter(s => s !== "NONE")
      .map(s => spaceMap[s])
      .join(" and ");

    const spaceInstruction = selectedSpaces 
      ? `Leave empty space at the ${selectedSpaces} of the frame for text overlay.` 
      : "";
    
    const thinkingPrompt = `
      Write a professional product photography prompt for ${settings.productName}.
      Concept: ${settings.concept}.
      Background: Plain paper background in a soft pastel color that matches the product's primary color.
      Props: ${formatProps(settings.props)}.
      Composition: The product and props must be neatly arranged and fit entirely within the frame.
      Empty Space: ${spaceInstruction}
      Camera: ${settings.camera.focalLength}mm lens, aperture ${settings.camera.aperture}, ISO ${settings.camera.iso}.
      Style: High-end studio photography, clean, minimalist, professional lighting.
      8k resolution, hyper-realistic.
    `;
    
    const thinkingResponse = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: thinkingPrompt,
      config: { thinkingConfig: { thinkingBudget: 1024 } }
    });
    finalPrompt = thinkingResponse.text || "";
  } else if (settings.visualStyle === "TRACK_SOCKET_STAGING") {
    const socketDetails = settings.sockets?.map((s, idx) => {
      let detail = `- Loại ổ cắm ${idx + 1}: Số lượng ${s.quantity}`;
      if (s.applianceNote) detail += `, dùng cho: ${s.applianceNote}`;
      return detail;
    }).join('\n      ') || '';

    if (settings.trackSocketMode === 'REFERENCE') {
      finalPrompt = `
        Hình ảnh trực quan sản phẩm: Gắn các ổ cắm được cung cấp lên thanh ray.
        Thanh ray được gắn cố định trên tường.
        Các ổ cắm là các thành phần mô-đun có thể di chuyển dọc theo thanh ray và xoay để khóa/mở khóa.
        
        Cấu hình ổ cắm:
        ${socketDetails}
        
        Bối cảnh: Tái tạo lại chính xác bối cảnh, phong cách, ánh sáng và không gian từ ảnh mẫu (reference image) được cung cấp.
        
        HƯỚNG DẪN QUAN TRỌNG:
        1. Giữ nguyên thiết kế nội thất, màu sắc và bố cục của ảnh mẫu.
        2. Thêm hệ thống thanh ray và ổ cắm vào vị trí hợp lý trên tường trong ảnh mẫu.
        3. Đặt chính xác số lượng ổ cắm đã chỉ định lên thanh ray.
        4. Ít nhất một ổ cắm PHẢI có thiết bị cắm vào.
        5. Nếu ổ cắm có ghi chú "dùng cho", hãy hiển thị thiết bị đó đang được cắm vào.
        6. Hệ thống thanh ray và ổ cắm phải hòa hợp hoàn hảo với môi trường của ảnh mẫu.
        
        Phong cách nhiếp ảnh kiến trúc chuyên nghiệp, 8k, siêu thực, ánh sáng và bóng đổ hoàn hảo.
      `;
    } else {
      finalPrompt = `
        Hình ảnh trực quan sản phẩm: Gắn các ổ cắm được cung cấp lên thanh ray.
        Thanh ray được gắn cố định trên tường, ưu tiên các vị trí lắp đặt cố định.
        Các ổ cắm là các thành phần mô-đun có thể di chuyển dọc theo thanh ray và xoay để khóa/mở khóa.
        
        Cấu hình ổ cắm:
        ${socketDetails}
        
        Bối cảnh: ${settings.location}. 
        Chi tiết môi trường: ${settings.concept || 'Nội thất hiện đại, sạch sẽ'}.
        
        HƯỚNG DẪN QUAN TRỌNG:
        1. Thanh ray phải được gắn trên tường hoặc bề mặt cố định phù hợp với bối cảnh.
        2. Đặt chính xác số lượng ổ cắm đã chỉ định lên thanh ray.
        3. Ít nhất một ổ cắm PHẢI có thiết bị cắm vào.
        4. Nếu ổ cắm có ghi chú "dùng cho", hãy hiển thị thiết bị đó đang được cắm vào.
        5. Hệ thống thanh ray và ổ cắm phải hòa hợp hoàn hảo với môi trường ${settings.location}.
        
        Phong cách nhiếp ảnh kiến trúc chuyên nghiệp, 8k, siêu thực, ánh sáng và bóng đổ hoàn hảo.
      `;
    }
  }

  const parts: any[] = [{ text: finalPrompt }];
  
  if (settings.visualStyle === "SCENE_STAGING") {
    if (settings.productImages[0]) parts.push({ inlineData: { data: settings.productImages[0].split(',')[1], mimeType: 'image/png' } });
    if (settings.referenceImage) parts.push({ inlineData: { data: settings.referenceImage.split(',')[1], mimeType: 'image/png' } });
  } else if (settings.visualStyle === "TRACK_SOCKET_STAGING") {
    if (settings.trackImage) parts.push({ inlineData: { data: settings.trackImage.split(',')[1], mimeType: 'image/png' } });
    settings.sockets?.forEach(s => {
      if (s.image) parts.push({ inlineData: { data: s.image.split(',')[1], mimeType: 'image/png' } });
    });
    if (settings.trackSocketMode === 'REFERENCE' && settings.referenceImage) {
      parts.push({ inlineData: { data: settings.referenceImage.split(',')[1], mimeType: 'image/png' } });
    }
  } else if (settings.visualStyle === "COLOR_CHANGE") {
    settings.colorChanges.forEach(c => {
      if (c.sampleImage) parts.push({ inlineData: { data: c.sampleImage.split(',')[1], mimeType: 'image/png' } });
    });
  } else if (settings.visualStyle === "PACKAGING_MOCKUP") {
    if (settings.packagingDesignType === "FLAT_DESIGN" && settings.packagingFaces.flat) parts.push({ inlineData: { data: settings.packagingFaces.flat.split(',')[1], mimeType: 'image/png' } });
  } else if (settings.referenceImage && (settings.visualStyle === "TECH_EFFECTS" || settings.visualStyle === "WHITE_BG_RETOUCH" || settings.visualStyle === "CONCEPT")) {
    parts.push({ inlineData: { data: settings.referenceImage.split(',')[1], mimeType: 'image/png' } });
  }
  
  if (settings.productImages.length > 0 && settings.visualStyle !== "SCENE_STAGING") {
    settings.productImages.forEach(img => parts.push({ inlineData: { data: img.split(',')[1], mimeType: 'image/png' } }));
  }

  try {
    let modelName = 'gemini-2.5-flash-image';
    let imageConfig: any = { aspectRatio: settings.aspectRatio };

    if (settings.imageSize === '2K' || settings.imageSize === '4K' || settings.aspectRatio === '1:4' || settings.aspectRatio === '4:1') {
      modelName = 'gemini-3.1-flash-image-preview';
      imageConfig.imageSize = settings.imageSize;
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config: { imageConfig }
    });
    if (!response.candidates?.[0]?.content?.parts) throw new Error("AI không phản hồi.");
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
    throw new Error("Không có ảnh.");
  } catch (error: any) { throw error; }
};