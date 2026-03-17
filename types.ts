export type AspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9" | "1:4" | "4:1";
export type ImageSize = "1K" | "2K" | "4K";
export type VisualStyle = "CONCEPT" | "TECH_PS" | "COLOR_CHANGE" | "PACKAGING_MOCKUP" | "TECH_EFFECTS" | "WHITE_BG_RETOUCH" | "SCENE_STAGING" | "STUDIO" | "TRACK_SOCKET_STAGING";

export interface CameraSettings {
  angle: number; // -15 to 90
  focalLength: number; // 12 to 200
  aperture: string;
  iso: string;
  isMacro: boolean;
}

export interface ColorChangeEntry {
  partName: string;
  sampleImage?: string;
  pantoneCode?: string;
  description?: string;
}

export interface ProductDimensions {
  length: string;
  width: string;
  height: string;
}

// Packaging specific types
export type PackagingMaterial = "COLOR_BOX" | "CARTON_BW";
export type PackagingDesignType = "FLAT_DESIGN" | "FACES_DESIGN";
export type PackagingOutputStyle = "WHITE_BG_ROTATED" | "CONTEXTUAL";

export interface PackagingFaces {
  flat?: string;
  front?: string;
  back?: string;
  left?: string;
  right?: string;
  top?: string;
}

// Tech Effects specific types
export type TechEffectType = "REMOVE_SIGNATURE" | "SEA_TECH_GENERATION";

// New White BG Retouch specific types
export type ProductMaterial = "MATTE" | "GLASS" | "STAINLESS_STEEL" | "GLOSSY";

export type EmptySpacePosition = "TOP" | "BOTTOM" | "LEFT" | "RIGHT" | "NONE";

export interface TrackSocketConfig {
  id: string;
  image: string;
  quantity: number;
  applianceNote: string;
}

export interface PropConfig {
  name: string;
  size?: 'small' | 'medium' | 'large' | 'auto';
  position?: 'left' | 'right' | 'front' | 'back' | 'background' | 'foreground' | 'auto';
  rotation?: 'tilted' | 'upright' | 'flat' | 'auto';
}

export interface GenerationSettings {
  productName: string;
  productImages: string[];
  referenceImage: string | null; // Hình ảnh gợi ý (Style Ref) hoặc ảnh gốc cho Tech Effect
  visualStyle: VisualStyle;
  techDescription: string;
  colorChanges: ColorChangeEntry[];
  dimensions: ProductDimensions;
  
  // Packaging specific fields
  packagingMaterial: PackagingMaterial;
  packagingDesignType: PackagingDesignType;
  packagingOutputStyle: PackagingOutputStyle;
  packagingFaces: PackagingFaces;

  // Tech Effects specific fields
  techEffectType: TechEffectType;
  techTitle: string; // Tiêu đề để lên ảnh
  selectedTechConcept: string; // Concept công nghệ đã chọn

  // White BG Retouch specific fields
  productMaterial: ProductMaterial;

  // Studio specific fields
  emptySpacePosition: EmptySpacePosition[];

  // Track & Socket specific fields
  trackImage?: string;
  sockets?: TrackSocketConfig[];
  trackSocketMode?: 'CREATIVE' | 'REFERENCE';

  concept: string; // Ý tưởng đã chốt
  location: string; // (Vẫn giữ cho các mode khác, nhưng Concept sẽ dùng logic riêng)
  camera: CameraSettings;
  props: PropConfig[]; // Đạo cụ đã chọn
  tone: string;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  numImages: number;
}

export interface AIConceptAnalysis {
  concepts: string[]; // 5 ý tưởng
  suggestedCamera: CameraSettings; // Gợi ý camera dựa trên sản phẩm
}

export interface AISuggestions {
  concepts: string[];
  locations: string[];
  props: string[];
}

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  timestamp: number;
  settings: GenerationSettings;
  variant: number;
}

export enum AppState {
  READY = 'READY',
  GENERATING = 'GENERATING',
  ANALYZING = 'ANALYZING'
}