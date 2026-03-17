import React, { useState, useEffect, useRef } from 'react';
import { AppState, GenerationSettings, GeneratedImage, AspectRatio, ImageSize, AISuggestions, VisualStyle, ColorChangeEntry, CameraSettings, PackagingFaces, PropConfig } from './types';
import { 
  CAMERA_APERTURES, 
  CAMERA_ISO, 
  TONE_STYLES 
} from './constants';
import { 
  generateProductImage, 
  getAiSuggestions, 
  analyzeConceptAndCamera, 
  analyzeTechConceptAndCamera,
  suggestPropsForConcept,
  suggestTechVisuals,
  suggestTechConcepts,
  analyzeStagingScene,
  analyzeStudioConcept
} from './services/geminiService';

const App: React.FC = () => {
  const [isLocked, setIsLocked] = useState(true); 
  const [passwordInput, setPasswordInput] = useState(""); 
  const [passwordError, setPasswordError] = useState(""); 
  
  const [appState, setAppState] = useState<AppState>(AppState.READY);
  const [loadingMessage, setLoadingMessage] = useState<string>("");
  
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [conceptStep, setConceptStep] = useState<number>(1);
  const [techStep, setTechStep] = useState<number>(1); 
  const [packagingStep, setPackagingStep] = useState<number>(1); 
  const [techEffectStep, setTechEffectStep] = useState<number>(1); 
  const [whiteBgStep, setWhiteBgStep] = useState<number>(1); 
  const [stagingStep, setStagingStep] = useState<number>(1); 
  const [studioStep, setStudioStep] = useState<number>(1); 
  const [trackSocketStep, setTrackSocketStep] = useState<number>(1); 

  const [suggestions, setSuggestions] = useState<AISuggestions>({
    concepts: [],
    locations: [],
    props: []
  });

  const [settings, setSettings] = useState<GenerationSettings>({
    productName: '',
    productImages: [],
    referenceImage: null,
    visualStyle: 'CONCEPT',
    techDescription: '',
    colorChanges: [],
    dimensions: { length: '', width: '', height: '' },
    packagingMaterial: 'COLOR_BOX',
    packagingDesignType: 'FLAT_DESIGN',
    packagingOutputStyle: 'WHITE_BG_ROTATED',
    packagingFaces: {},
    techEffectType: 'REMOVE_SIGNATURE',
    techTitle: '',
    selectedTechConcept: '',
    productMaterial: 'MATTE',
    emptySpacePosition: [],
    sockets: [],
    trackSocketMode: 'CREATIVE',
    concept: '',
    location: '',
    camera: { focalLength: 50, aperture: 'f/2.8', iso: '100', isMacro: false, angle: 0 },
    props: [],
    tone: TONE_STYLES[0],
    aspectRatio: '1:1',
    imageSize: '1K',
    numImages: 1 
  });
  
  const [customConcept, setCustomConcept] = useState('');
  const [customProp, setCustomProp] = useState('');
  const [currentColorPart, setCurrentColorPart] = useState('');
  const [currentPantoneCode, setCurrentPantoneCode] = useState('');
  const [currentColorDescription, setCurrentColorDescription] = useState('');
  const [currentSampleImage, setCurrentSampleImage] = useState<string | null>(null); 
  
  const [gallery, setGallery] = useState<GeneratedImage[]>([]);
  const [activeImage, setActiveImage] = useState<GeneratedImage | null>(null);

  const productFilesRef = useRef<HTMLInputElement>(null);
  const refFileRef = useRef<HTMLInputElement>(null);
  const colorSampleRef = useRef<HTMLInputElement>(null);
  const packagingFileRef = useRef<HTMLInputElement>(null); 
  const trackFileRef = useRef<HTMLInputElement>(null);
  const socketFileRef = useRef<HTMLInputElement>(null);
  const pendingPackagingFace = useRef<keyof PackagingFaces | "flat">("flat");

  const handleUnlock = () => {
    if (passwordInput === "180692") {
      setIsLocked(false);
      setPasswordError("");
    } else {
      setPasswordError("Mật khẩu không chính xác");
    }
  };

  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width; let height = img.height;
          const maxDim = 2560; 
          if (width > maxDim || height > maxDim) {
            const ratio = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * ratio); height = Math.round(height * ratio);
          }
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => reject(new Error("Lỗi đọc ảnh"));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error("Lỗi file"));
      reader.readAsDataURL(file);
    });
  };

  const onImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'product' | 'reference' | 'color_sample' | 'packaging' | 'track' | 'socket') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      if (type === 'packaging') {
          const base64 = await resizeImage(files[0]);
          const face = pendingPackagingFace.current;
          setSettings(prev => ({ ...prev, packagingFaces: { ...prev.packagingFaces, [face]: base64 } }));
      } else if (type === 'color_sample') {
        const base64 = await resizeImage(files[0]);
        setCurrentSampleImage(base64); 
      } else if (type === 'reference') {
        const base64 = await resizeImage(files[0]);
        setSettings(prev => ({ ...prev, referenceImage: base64 }));
      } else if (type === 'product') {
        const newImages = await Promise.all(Array.from(files).map((file) => resizeImage(file as File)));
        setSettings(prev => ({ ...prev, productImages: [...prev.productImages, ...newImages].slice(0, 5) }));
      } else if (type === 'track') {
        const base64 = await resizeImage(files[0]);
        setSettings(prev => ({ ...prev, trackImage: base64 }));
      } else if (type === 'socket') {
        const base64 = await resizeImage(files[0]);
        setSettings(prev => ({ 
          ...prev, 
          sockets: [...(prev.sockets || []), { id: Date.now().toString(), image: base64, quantity: 1, applianceNote: '' }] 
        }));
      }
    } catch (error) { alert("Lỗi khi tải ảnh."); }
    e.target.value = '';
  };

  // --- LOGIC CONCEPT WORKFLOW (STRICT 4 STEPS) ---
  const handleConceptAnalysis = async () => {
    if (!settings.productName || settings.productImages.length === 0) return alert("Vui lòng nhập tên và tải ít nhất 1 ảnh sản phẩm.");
    setAppState(AppState.ANALYZING);
    setLoadingMessage("AI đang phân tích dữ liệu và đề xuất concept...");
    try {
      const dimStr = `${settings.dimensions.length}x${settings.dimensions.width}x${settings.dimensions.height}mm`;
      const result = await analyzeConceptAndCamera(settings.productName, dimStr, settings.productImages, settings.referenceImage);
      setSuggestions(prev => ({ ...prev, concepts: result.concepts }));
      setSettings(prev => ({ ...prev, camera: result.suggestedCamera, concept: result.concepts[0] }));
      setConceptStep(2);
    } catch (e: any) { console.error(e); } 
    finally { setAppState(AppState.READY); }
  };

  const handlePropSuggestion = async () => {
    const finalConcept = settings.concept;
    if (!finalConcept) return alert("Vui lòng chọn hoặc nhập 1 concept.");
    setAppState(AppState.ANALYZING);
    setLoadingMessage("AI đang tìm kiếm đạo cụ phù hợp cho concept này...");
    try {
      const props = await suggestPropsForConcept(settings.productName, finalConcept);
      setSuggestions(prev => ({ ...prev, props: props }));
      setSettings(prev => ({ ...prev, props: [] }));
      setConceptStep(3);
    } catch (e) { console.error(e); } 
    finally { setAppState(AppState.READY); }
  };

  const addCustomConceptToList = () => {
    if (customConcept && !suggestions.concepts.includes(customConcept)) {
      setSuggestions(prev => ({ ...prev, concepts: [customConcept, ...prev.concepts] }));
      setSettings(prev => ({ ...prev, concept: customConcept }));
      setCustomConcept('');
    }
  };

  const addCustomPropToList = () => {
    if (customProp && !suggestions.props.includes(customProp)) {
      setSuggestions(prev => ({ ...prev, props: [customProp, ...prev.props] }));
      setSettings(prev => ({ ...prev, props: [...prev.props, { name: customProp, size: 'auto', position: 'auto', rotation: 'auto' }] }));
      setCustomProp('');
    }
  };

  const toggleProp = (propName: string) => {
    setSettings(prev => {
      const exists = prev.props.some(p => p.name === propName);
      if (exists) {
        return { ...prev, props: prev.props.filter(p => p.name !== propName) };
      } else {
        return { ...prev, props: [...prev.props, { name: propName, size: 'auto', position: 'auto', rotation: 'auto' }] };
      }
    });
  };

  const updateProp = (propName: string, updates: Partial<PropConfig>) => {
    setSettings(prev => ({
      ...prev,
      props: prev.props.map(p => p.name === propName ? { ...p, ...updates } : p)
    }));
  };

  // --- LOGIC TECH WORKFLOW ---
  const handleTechAnalysis = async () => {
    if (!settings.productName || !settings.techDescription || settings.productImages.length === 0) return alert("Thiếu thông tin");
    setAppState(AppState.ANALYZING);
    setLoadingMessage("Gemini đang thiết kế ý tưởng kỹ thuật...");
    try {
      const dimStr = `${settings.dimensions.length}x${settings.dimensions.width}x${settings.dimensions.height}mm`;
      const result = await analyzeTechConceptAndCamera(settings.productName, settings.techDescription, dimStr, settings.productImages);
      setSuggestions(prev => ({ ...prev, concepts: result.concepts }));
      setSettings(prev => ({ ...prev, camera: result.suggestedCamera, concept: result.concepts[0] }));
      setTechStep(3);
    } catch (e: any) { console.error(e); } 
    finally { setAppState(AppState.READY); }
  };

  const handleTechVisualSuggestion = async () => {
    const finalConcept = settings.concept;
    setAppState(AppState.ANALYZING);
    setLoadingMessage("Đang tìm hiệu ứng...");
    try {
      const visuals = await suggestTechVisuals(settings.productName, finalConcept);
      setSuggestions(prev => ({ ...prev, props: visuals }));
      setSettings(prev => ({ ...prev, props: [] }));
      setTechStep(4);
    } catch (e) { console.error(e); } 
    finally { setAppState(AppState.READY); }
  };

  const handleSeaConceptSuggestion = async () => {
      if (!settings.productName || !settings.techTitle) return alert("Thiếu tên SP/Tiêu đề");
      setAppState(AppState.ANALYZING);
      setLoadingMessage("Đang gợi ý concept biển...");
      try {
          const concepts = await suggestTechConcepts(settings.productName, settings.techTitle);
          setSuggestions(prev => ({ ...prev, concepts }));
          setSettings(prev => ({ ...prev, selectedTechConcept: concepts[0] }));
          setTechEffectStep(3);
      } catch (e) { console.error(e); }
      finally { setAppState(AppState.READY); }
  };

  const handleStagingAnalysis = async () => {
      if (!settings.concept || !settings.productImages[0] || !settings.referenceImage) return alert("Vui lòng điền đủ thông tin & up ảnh.");
      setAppState(AppState.ANALYZING);
      setLoadingMessage("AI đang phân tích phối cảnh...");
      try {
          const items = await analyzeStagingScene(settings.concept, settings.productImages[0], settings.referenceImage);
          setSuggestions(prev => ({ ...prev, props: items }));
          setSettings(prev => ({ ...prev, props: [] }));
          setStagingStep(4);
      } catch (e: any) { console.error(e); } 
      finally { setAppState(AppState.READY); }
  };

  // --- LOGIC STUDIO WORKFLOW ---
  const handleStudioAnalysis = async () => {
    if (!settings.productName || settings.productImages.length === 0) return alert("Vui lòng nhập tên và tải ít nhất 1 ảnh sản phẩm.");
    setAppState(AppState.ANALYZING);
    setLoadingMessage("AI đang phân tích và đề xuất Studio Concept...");
    try {
      const dimStr = `${settings.dimensions.length}x${settings.dimensions.width}x${settings.dimensions.height}mm`;
      const result = await analyzeStudioConcept(settings.productName, dimStr, settings.productImages);
      setSuggestions(prev => ({ ...prev, concepts: result.concepts }));
      setSettings(prev => ({ ...prev, camera: result.suggestedCamera, concept: result.concepts[0] }));
      setStudioStep(2);
    } catch (e: any) { console.error(e); } 
    finally { setAppState(AppState.READY); }
  };

  const handleStudioPropSuggestion = async () => {
    const finalConcept = settings.concept;
    if (!finalConcept) return alert("Vui lòng chọn hoặc nhập 1 concept.");
    setAppState(AppState.ANALYZING);
    setLoadingMessage("AI đang tìm kiếm đạo cụ Studio phù hợp...");
    try {
      const props = await suggestPropsForConcept(settings.productName, finalConcept);
      setSuggestions(prev => ({ ...prev, props: props }));
      setSettings(prev => ({ ...prev, props: [] }));
      setStudioStep(3);
    } catch (e) { console.error(e); } 
    finally { setAppState(AppState.READY); }
  };

  const startGeneration = async () => {
    setAppState(AppState.GENERATING);
    setLoadingMessage("Gemini Thinking đang chuẩn bị kiệt tác...");
    try {
      const urls = await Promise.all(Array.from({ length: settings.numImages }, (_, i) => generateProductImage(settings, i + 1)));
      const time = Date.now();
      const newImages: GeneratedImage[] = urls.map((url, i) => ({ id: `${time}-${i}`, url, prompt: settings.concept, timestamp: time, settings: { ...settings }, variant: i + 1 }));
      setGallery(prev => [...newImages, ...prev]);
      setActiveImage(newImages[0]);
    } catch (error: any) {
      console.error(error);
      alert("Lỗi tạo ảnh.");
    } finally { setAppState(AppState.READY); }
  };

  const resetMode = () => {
    setCurrentStep(1); setConceptStep(1); setTechStep(1); setPackagingStep(1); setTechEffectStep(1); setWhiteBgStep(1); setStagingStep(1); setStudioStep(1); setTrackSocketStep(1);
    setSettings(prev => ({
      ...prev, productName: '', productImages: [], referenceImage: null, techDescription: '', concept: '', props: [], colorChanges: [], packagingFaces: {}, techTitle: '', selectedTechConcept: '', productMaterial: 'MATTE', emptySpacePosition: [], trackImage: undefined, sockets: []
    }));
    setSuggestions({ concepts: [], locations: [], props: [] });
    setCurrentSampleImage(null); setCustomConcept(''); setCustomProp('');
  };

  // --- RENDER FUNCTIONS ---

  const renderSelectedProps = () => {
    if (settings.props.length === 0) return null;
    return (
      <div className="space-y-2 pt-4 border-t border-white/10">
        <label className="block text-[9px] font-bold text-slate-400 uppercase">Tùy chỉnh đạo cụ đã chọn</label>
        <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
          {settings.props.map(p => (
            <div key={p.name} className="bg-white/5 p-2 rounded-lg border border-white/10 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-white">{p.name}</span>
                <button onClick={() => toggleProp(p.name)} className="text-red-400 text-[10px] hover:underline">Xóa</button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select className="bg-black/20 border border-white/10 rounded p-1 text-[9px] text-white outline-none" value={p.size || 'auto'} onChange={e => updateProp(p.name, { size: e.target.value as any })}>
                  <option value="auto">Kích thước</option>
                  <option value="small">Nhỏ</option>
                  <option value="medium">Vừa</option>
                  <option value="large">Lớn</option>
                </select>
                <select className="bg-black/20 border border-white/10 rounded p-1 text-[9px] text-white outline-none" value={p.position || 'auto'} onChange={e => updateProp(p.name, { position: e.target.value as any })}>
                  <option value="auto">Vị trí</option>
                  <option value="left">Trái</option>
                  <option value="right">Phải</option>
                  <option value="front">Trước</option>
                  <option value="back">Sau</option>
                  <option value="background">Nền</option>
                  <option value="foreground">Tiền cảnh</option>
                </select>
                <select className="bg-black/20 border border-white/10 rounded p-1 text-[9px] text-white outline-none" value={p.rotation || 'auto'} onChange={e => updateProp(p.name, { rotation: e.target.value as any })}>
                  <option value="auto">Góc xoay</option>
                  <option value="tilted">Nghiêng</option>
                  <option value="upright">Thẳng đứng</option>
                  <option value="flat">Nằm ngang</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // 1. Ảnh concept Workflow (Lifestyle Concept)
  const renderConceptWorkflow = () => (
    <section className="animate-fade-in space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map(step => (
            <div key={step} className={`h-1 flex-1 rounded-full ${conceptStep >= step ? 'bg-[#caf0f8]' : 'bg-white/10'}`}></div>
          ))}
        </div>
        <h2 className="text-xl font-bold text-white mt-2">
           {conceptStep === 1 ? "Bước 1: Nhập dữ liệu" : 
            conceptStep === 2 ? "Bước 2: Chọn Ý tưởng" : 
            conceptStep === 3 ? "Bước 3: Chọn Đạo cụ" : "Bước 4: Camera & Xuất bản"}
        </h2>
      </div>

      {conceptStep === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-2">Thông tin sản phẩm</label>
            <input type="text" placeholder="Tên sản phẩm..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#caf0f8]" value={settings.productName} onChange={e => setSettings({...settings, productName: e.target.value})} />
            <div className="grid grid-cols-3 gap-2 mt-2">
               {['length', 'width', 'height'].map(f => (
                 <input key={f} type="number" placeholder={f === 'length' ? 'Dài' : f === 'width' ? 'Rộng' : 'Cao'} className="bg-white/5 border border-white/10 rounded-lg p-2 text-xs text-white outline-none focus:border-[#caf0f8]" value={(settings.dimensions as any)[f]} onChange={e => setSettings({...settings, dimensions: {...settings.dimensions, [f]: e.target.value}})} />
               ))}
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-2">Ảnh sản phẩm (Tải 1-5 ảnh)</label>
            <div className="grid grid-cols-5 gap-2">
               {settings.productImages.map((img, i) => (
                 <div key={i} className="aspect-square bg-white/5 border border-white/10 rounded-lg overflow-hidden relative group">
                   <img src={img} className="w-full h-full object-cover" />
                   <button onClick={() => setSettings(s => ({...s, productImages: s.productImages.filter((_, idx) => idx !== i)}))} className="absolute inset-0 bg-red-500/80 opacity-0 group-hover:opacity-100 transition-all text-xs">✕</button>
                 </div>
               ))}
               {settings.productImages.length < 5 && (
                 <button onClick={() => productFilesRef.current?.click()} className="aspect-square border-2 border-dashed border-white/10 rounded-lg text-white flex items-center justify-center hover:border-[#caf0f8]">+</button>
               )}
            </div>
            <input type="file" hidden ref={productFilesRef} accept="image/*" multiple onChange={e => onImageUpload(e, 'product')} />
          </div>

          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-2">Ảnh mẫu style tham khảo</label>
            <div onClick={() => refFileRef.current?.click()} className="h-24 w-full bg-white/5 border-2 border-dashed border-white/10 rounded-xl flex items-center justify-center cursor-pointer hover:border-[#caf0f8] overflow-hidden">
               {settings.referenceImage ? <img src={settings.referenceImage} className="h-full w-full object-contain" /> : <span className="text-slate-400 text-[10px] font-bold uppercase">+ Thêm ảnh mẫu style</span>}
            </div>
            <input type="file" hidden ref={refFileRef} accept="image/*" onChange={e => onImageUpload(e, 'reference')} />
          </div>

          <button onClick={handleConceptAnalysis} className="w-full py-4 bg-[#caf0f8] text-[#051610] font-bold rounded-xl uppercase text-xs shadow-lg hover:brightness-110 transition-all">Tiếp tục</button>
        </div>
      )}

      {conceptStep === 2 && (
        <div className="space-y-4">
           <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
             {suggestions.concepts.map(c => (
               <button key={c} onClick={() => setSettings({...settings, concept: c})} className={`w-full text-left p-4 rounded-xl border text-[10px] leading-relaxed transition-all ${settings.concept === c ? 'bg-[#caf0f8] text-[#051610] border-[#caf0f8]' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}>{c}</button>
             ))}
           </div>
           
           <div className="pt-4 border-t border-white/10 space-y-2">
              <label className="block text-[9px] font-bold text-slate-400 uppercase">Tự thêm concept mới</label>
              <div className="flex gap-2">
                 <input type="text" placeholder="Nhập concept của bạn..." className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-[#caf0f8]" value={customConcept} onChange={e => setCustomConcept(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomConceptToList()} />
                 <button onClick={addCustomConceptToList} className="px-5 bg-white/10 rounded-xl text-white font-bold hover:bg-white/20 transition-all">+</button>
              </div>
           </div>

           <div className="flex gap-2 pt-2">
              <button onClick={() => setConceptStep(1)} className="flex-1 py-4 border border-white/10 text-white rounded-xl uppercase text-[10px] font-bold">Quay lại</button>
              <button onClick={handlePropSuggestion} className="flex-[2] py-4 bg-[#caf0f8] text-[#051610] font-bold rounded-xl uppercase text-xs">Tiếp tục</button>
           </div>
        </div>
      )}

      {conceptStep === 3 && (
        <div className="space-y-5">
          <div className="bg-[#caf0f8]/10 p-3 rounded-xl border border-[#caf0f8]/20">
             <div className="text-[8px] font-bold text-[#caf0f8] uppercase mb-1">Concept đã chọn:</div>
             <div className="text-[10px] text-white italic">"{settings.concept}"</div>
          </div>

          <div>
             <label className="block text-[9px] font-bold text-slate-400 uppercase mb-2">Gợi ý đạo cụ</label>
             <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                {suggestions.props.map(p => (
                  <button key={p} onClick={() => toggleProp(p)} className={`px-3 py-2 rounded-lg border text-[9px] font-bold transition-all ${settings.props.some(i => i.name === p) ? 'bg-[#caf0f8] text-[#051610] border-[#caf0f8]' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}>{p}</button>
                ))}
             </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/10">
             <label className="block text-[9px] font-bold text-slate-400 uppercase">Thêm đạo cụ khác</label>
             <div className="flex gap-2">
                <input type="text" placeholder="Nhập tên đạo cụ..." className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 text-xs text-white outline-none focus:border-[#caf0f8]" value={customProp} onChange={e => setCustomProp(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomPropToList()} />
                <button onClick={addCustomPropToList} className="px-5 bg-white/10 rounded-xl text-white font-bold hover:bg-white/20 transition-all">+</button>
             </div>
          </div>

          {renderSelectedProps()}

          <div className="flex gap-2">
              <button onClick={() => setConceptStep(2)} className="flex-1 py-4 border border-white/10 text-white rounded-xl uppercase text-[10px] font-bold">Quay lại</button>
              <button onClick={() => setConceptStep(4)} className="flex-[2] py-4 bg-[#caf0f8] text-[#051610] font-bold rounded-xl uppercase text-xs">Tiếp tục</button>
          </div>
        </div>
      )}

      {conceptStep === 4 && renderCameraSettings(() => setConceptStep(3))}
    </section>
  );

  // 2. Xây dựng phối cảnh Workflow (Real Scene Staging)
  const renderStagingWorkflow = () => {
    const displayedProps = Array.from(new Set([...suggestions.props, ...settings.props.map(p => p.name)]));
    return (
      <section className="animate-fade-in space-y-6">
        <div className="space-y-1">
           <div className="flex items-center gap-2">
             {[1, 2, 3, 4, 5].map(step => (
               <div key={step} className={`h-1 flex-1 rounded-full ${stagingStep >= step ? 'bg-indigo-400' : 'bg-white/10'}`}></div>
             ))}
           </div>
           <h2 className="text-xl font-bold text-white mt-2">Xây dựng phối cảnh</h2>
        </div>
        {stagingStep === 1 && (
            <div className="space-y-4">
                <textarea className="w-full h-32 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-indigo-400 outline-none resize-none" placeholder="Mô tả ý tưởng trang trí..." value={settings.concept} onChange={e => setSettings({...settings, concept: e.target.value})} />
                <button onClick={() => settings.concept ? setStagingStep(2) : alert("Thiếu mô tả!")} className="w-full py-3 bg-indigo-500 text-white font-bold rounded-xl uppercase text-[10px]">Tiếp tục</button>
            </div>
        )}
        {stagingStep === 2 && (
            <div className="space-y-4">
                <div onClick={() => productFilesRef.current?.click()} className="aspect-video w-full bg-white/5 border-2 border-dashed border-white/10 rounded-xl flex items-center justify-center cursor-pointer overflow-hidden relative">
                    {settings.productImages[0] ? <img src={settings.productImages[0]} className="w-full h-full object-contain" /> : <span className="text-indigo-400 font-bold uppercase text-xs">+ Ảnh thực tế</span>}
                </div>
                <input type="file" hidden ref={productFilesRef} accept="image/*" onChange={e => onImageUpload(e, 'product')} />
                <div className="flex gap-2">
                  <button onClick={() => setStagingStep(1)} className="flex-1 py-3 border border-white/10 text-white rounded-xl text-[10px]">Quay lại</button>
                  <button onClick={() => settings.productImages[0] ? setStagingStep(3) : alert("Thiếu ảnh!")} className="flex-[2] py-3 bg-indigo-500 text-white font-bold rounded-xl uppercase text-[10px]">Tiếp tục</button>
                </div>
            </div>
        )}
        {stagingStep === 3 && (
            <div className="space-y-4">
                <div onClick={() => refFileRef.current?.click()} className="aspect-video w-full bg-white/5 border-2 border-dashed border-white/10 rounded-xl flex items-center justify-center cursor-pointer overflow-hidden relative">
                    {settings.referenceImage ? <img src={settings.referenceImage} className="w-full h-full object-contain" /> : <span className="text-indigo-400 font-bold uppercase text-xs">+ Ảnh mẫu phong cách</span>}
                </div>
                <input type="file" hidden ref={refFileRef} accept="image/*" onChange={e => onImageUpload(e, 'reference')} />
                <div className="flex gap-2">
                  <button onClick={() => setStagingStep(2)} className="flex-1 py-3 border border-white/10 text-white rounded-xl text-[10px]">Quay lại</button>
                  <button onClick={handleStagingAnalysis} className="flex-[2] py-3 bg-indigo-500 text-white font-bold rounded-xl uppercase text-[10px]">AI Phân tích</button>
                </div>
            </div>
        )}
        {stagingStep === 4 && (
            <div className="space-y-4">
                <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto custom-scrollbar">
                   {displayedProps.map(p => (
                     <button key={p} onClick={() => toggleProp(p)} className={`px-3 py-2 rounded-lg border text-[9px] font-bold transition-all ${settings.props.some(i => i.name === p) ? 'bg-indigo-400 text-black border-indigo-400' : 'bg-white/5 border-white/10 text-slate-400'}`}>{p}</button>
                   ))}
                </div>
                <div className="flex gap-2 mt-4 pt-4 border-t border-white/10">
                   <input type="text" placeholder="Thêm vật phẩm khác..." className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 text-xs text-white outline-none focus:border-indigo-400" value={customProp} onChange={e => setCustomProp(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomPropToList()} />
                   <button onClick={addCustomPropToList} className="px-5 bg-white/10 rounded-xl text-white font-bold">+</button>
                </div>
                {renderSelectedProps()}
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setStagingStep(3)} className="flex-1 py-3 border border-white/10 text-white rounded-xl text-[10px]">Quay lại</button>
                  <button onClick={() => setStagingStep(5)} className="flex-[2] py-3 bg-indigo-500 text-white font-bold rounded-xl uppercase text-[10px]">Cấu hình cuối</button>
                </div>
            </div>
        )}
        {stagingStep === 5 && (
            <div className="space-y-5">
               <div className="bg-white/5 rounded-xl p-4 border border-white/10 space-y-2 text-center">
                   <h3 className="font-bold text-white text-sm">Sẵn sàng dựng phối cảnh</h3>
                   <p className="text-[10px] text-slate-400">Concept: {settings.concept.substring(0, 30)}... | Props: {settings.props.length}</p>
               </div>
               <button onClick={startGeneration} className="w-full py-4 bg-indigo-500 text-white font-bold rounded-xl uppercase text-xs shadow-xl">Tạo ảnh</button>
            </div>
        )}
      </section>
    );
  };

  // 3. Ảnh USP công nghệ Workflow (Tech USP Visual)
  const renderTechWorkflow = () => (
    <section className="animate-fade-in space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map(step => (
            <div key={step} className={`h-1 flex-1 rounded-full ${techStep >= step ? 'bg-[#2d6a4f]' : 'bg-white/10'}`}></div>
          ))}
        </div>
        <h2 className="text-xl font-bold text-white mt-2">Ảnh USP công nghệ</h2>
      </div>

      {techStep === 1 && (
        <div className="space-y-4">
          <input type="text" placeholder="Tên sản phẩm..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#2d6a4f]" value={settings.productName} onChange={e => setSettings({...settings, productName: e.target.value})} />
          <textarea placeholder="Mô tả tính năng kỹ thuật..." className="w-full h-24 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white resize-none outline-none focus:border-[#2d6a4f]" value={settings.techDescription} onChange={e => setSettings({...settings, techDescription: e.target.value})} />
          <div onClick={() => productFilesRef.current?.click()} className="h-32 w-full bg-white/5 border-2 border-dashed border-white/10 rounded-xl flex items-center justify-center cursor-pointer overflow-hidden">
            {settings.productImages.length > 0 ? <img src={settings.productImages[0]} className="h-full object-contain" /> : <span className="text-slate-400 text-xs font-bold uppercase">+ Ảnh SP</span>}
          </div>
          <input type="file" hidden ref={productFilesRef} accept="image/*" multiple onChange={e => onImageUpload(e, 'product')} />
          <button onClick={() => (settings.productName && settings.techDescription) ? setTechStep(2) : alert("Thiếu thông tin")} className="w-full py-4 bg-[#2d6a4f] text-white font-bold rounded-xl uppercase text-xs">Tiếp tục</button>
        </div>
      )}

      {techStep === 2 && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
             {['length', 'width', 'height'].map(f => (
               <input key={f} type="number" placeholder={f} className="bg-white/5 border border-white/10 rounded-lg p-3 text-xs text-white outline-none focus:border-[#2d6a4f]" value={(settings.dimensions as any)[f]} onChange={e => setSettings({...settings, dimensions: {...settings.dimensions, [f]: e.target.value}})} />
             ))}
          </div>
          <button onClick={handleTechAnalysis} className="w-full py-4 bg-[#2d6a4f] text-white font-bold rounded-xl uppercase text-xs">AI Thiết kế Visual</button>
        </div>
      )}

      {techStep === 3 && (
        <div className="space-y-4">
           <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
             {suggestions.concepts.map(c => (
               <button key={c} onClick={() => setSettings({...settings, concept: c})} className={`w-full text-left p-3 rounded-xl border text-[10px] font-medium transition-all ${settings.concept === c ? 'bg-[#2d6a4f] text-white border-[#2d6a4f]' : 'bg-white/5 border-white/10 text-white'}`}>{c}</button>
             ))}
           </div>
           <div className="pt-4 border-t border-white/10 space-y-2">
              <input type="text" placeholder="Tự nhập tech concept..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none" value={customConcept} onChange={e => setCustomConcept(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomConceptToList()} />
              <button onClick={addCustomConceptToList} className="w-full py-2 bg-white/10 rounded-lg text-white text-[10px]">Thêm vào danh sách</button>
           </div>
           <button onClick={handleTechVisualSuggestion} className="w-full py-4 bg-[#2d6a4f] text-white font-bold rounded-xl uppercase text-xs">Tiếp tục</button>
        </div>
      )}

      {techStep === 4 && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {suggestions.props.map(p => (
              <button key={p} onClick={() => toggleProp(p)} className={`px-3 py-2 rounded-lg border text-[9px] font-bold transition-all ${settings.props.some(i => i.name === p) ? 'bg-[#2d6a4f] text-white' : 'bg-white/5 border-white/10 text-slate-400'}`}>{p}</button>
            ))}
          </div>
          <div className="pt-4 border-t border-white/10 space-y-2">
             <div className="flex gap-2">
                <input type="text" placeholder="Thêm visual element..." className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 text-xs text-white outline-none" value={customProp} onChange={e => setCustomProp(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomPropToList()} />
                <button onClick={addCustomPropToList} className="px-5 bg-white/10 rounded-xl text-white font-bold">+</button>
             </div>
          </div>
          {renderSelectedProps()}
          <button onClick={() => setTechStep(5)} className="w-full py-4 bg-[#2d6a4f] text-white font-bold rounded-xl uppercase text-xs">Cấu hình Camera</button>
        </div>
      )}

      {techStep === 5 && renderCameraSettings(() => setTechStep(4))}
    </section>
  );

  // 4. Làm màu sản phẩm Workflow
  const renderColorWorkflow = () => (
    <section className="animate-fade-in space-y-6">
      <div className="space-y-1"><h2 className="text-xl font-bold text-white">Làm màu sản phẩm</h2></div>
      <div className="space-y-4">
        <input type="text" placeholder="Tên SP..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#caf0f8]" value={settings.productName} onChange={e => setSettings({...settings, productName: e.target.value})} />
        
        <div className="space-y-2">
          <label className="block text-[10px] font-bold text-slate-400 uppercase">Ảnh sản phẩm gốc</label>
          <div onClick={() => productFilesRef.current?.click()} className="h-40 w-full bg-white/5 border-2 border-dashed border-white/10 rounded-2xl flex items-center justify-center cursor-pointer overflow-hidden">
            {settings.productImages[0] ? <img src={settings.productImages[0]} className="h-full object-contain" /> : <span className="text-[#caf0f8] font-bold text-xs uppercase">+ Ảnh gốc</span>}
          </div>
          <input type="file" hidden ref={productFilesRef} accept="image/*" onChange={e => onImageUpload(e, 'product')} />
        </div>

        <div className="space-y-3">
            <label className="block text-[10px] font-bold text-slate-400 uppercase">Danh sách thay đổi màu</label>
            {settings.colorChanges.map((c, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 text-[10px]">
                <div className="flex items-center gap-3">
                  {c.sampleImage && <img src={c.sampleImage} className="w-8 h-8 rounded object-cover border border-white/10" />}
                  <div>
                    <div className="font-bold text-white">{c.partName}</div>
                    <div className="text-slate-400">{c.pantoneCode || 'Không có mã Pantone'}</div>
                  </div>
                </div>
                <button onClick={()=>setSettings(s=>({...s, colorChanges:s.colorChanges.filter((_,idx)=>idx!==i)}))} className="text-red-400 hover:text-red-300">✕</button>
              </div>
            ))}
            
            <div className="bg-white/5 p-4 rounded-2xl border border-white/10 space-y-3">
                <div className="text-[9px] font-bold text-[#caf0f8] uppercase mb-1">Thêm vị trí đổi màu</div>
                <input type="text" placeholder="Vị trí (VD: Thân vỏ, Nắp chai...)" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#caf0f8]" value={currentColorPart} onChange={e=>setCurrentColorPart(e.target.value)} />
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="block text-[8px] font-bold text-slate-400 uppercase">Mã Pantone (Tùy chọn)</label>
                    <input type="text" placeholder="VD: Pantone 18-1662" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#caf0f8]" value={currentPantoneCode} onChange={e=>setCurrentPantoneCode(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[8px] font-bold text-slate-400 uppercase">Ảnh mẫu màu</label>
                    <div onClick={() => colorSampleRef.current?.click()} className="h-[38px] w-full bg-black/20 border border-dashed border-white/10 rounded-lg flex items-center justify-center cursor-pointer overflow-hidden">
                      {currentSampleImage ? <img src={currentSampleImage} className="h-full object-cover w-full" /> : <span className="text-[8px] text-slate-500 uppercase">+ Tải ảnh</span>}
                    </div>
                    <input type="file" hidden ref={colorSampleRef} accept="image/*" onChange={e => onImageUpload(e, 'color_sample')} />
                  </div>
                </div>

                <textarea placeholder="Mô tả thêm (VD: Màu đỏ nhám, hiệu ứng kim loại...)" className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#caf0f8] h-16 resize-none" value={currentColorDescription} onChange={e=>setCurrentColorDescription(e.target.value)} />

                <button 
                  onClick={()=>{
                    if(currentColorPart){
                      setSettings(s=>({...s, colorChanges:[...s.colorChanges, {
                        partName: currentColorPart, 
                        pantoneCode: currentPantoneCode,
                        description: currentColorDescription,
                        sampleImage: currentSampleImage || undefined
                      }]})); 
                      setCurrentColorPart('');
                      setCurrentPantoneCode('');
                      setCurrentColorDescription('');
                      setCurrentSampleImage(null);
                    }
                  }} 
                  className="w-full py-2 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-bold text-white transition-all"
                >
                  + Thêm vào danh sách
                </button>
            </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-slate-400 uppercase">Chất lượng ảnh</label>
            <div className="grid grid-cols-3 gap-1">
              {(['1K', '2K', '4K'] as ImageSize[]).map(size => (
                <button key={size} onClick={() => setSettings({...settings, imageSize: size})} className={`py-2 rounded-lg border text-[9px] font-bold transition-all ${settings.imageSize === size ? 'bg-[#caf0f8] text-black border-[#caf0f8]' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}>{size}</button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] font-bold text-slate-400 uppercase">Tỉ lệ khung hình</label>
            <select className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-[10px] text-white outline-none focus:border-[#caf0f8]" value={settings.aspectRatio} onChange={e => setSettings({...settings, aspectRatio: e.target.value as AspectRatio})}>
              {['1:1', '3:4', '4:3', '9:16', '16:9', '1:4', '4:1'].map(r => <option key={r} value={r} className="bg-[#051610]">{r}</option>)}
            </select>
          </div>
        </div>

        <button onClick={startGeneration} className="w-full py-4 bg-[#caf0f8] text-black font-bold rounded-2xl uppercase text-xs shadow-lg shadow-cyan-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all">Tạo ảnh</button>
      </div>
    </section>
  );

  // 5. Dựng mockup bao bì Workflow (Packaging Mockup)
  const renderPackagingWorkflow = () => (
    <section className="animate-fade-in space-y-6">
      <div className="space-y-1"><h2 className="text-xl font-bold text-white">Dựng mockup bao bì</h2></div>
      {packagingStep === 1 && (
        <div className="space-y-4">
          <input type="text" placeholder="Tên sản phẩm..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none" value={settings.productName} onChange={e => setSettings({...settings, productName: e.target.value})} />
          <div className="grid grid-cols-3 gap-2">
             {['length', 'width', 'height'].map(f => (
               <input key={f} type="number" placeholder={f} className="bg-white/5 border border-white/10 rounded-lg p-2 text-xs text-white outline-none" value={(settings.dimensions as any)[f]} onChange={e => setSettings({...settings, dimensions: {...settings.dimensions, [f]: e.target.value}})} />
             ))}
          </div>
          <select className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none" value={settings.packagingMaterial} onChange={e => setSettings({...settings, packagingMaterial: e.target.value as any})}>
             <option value="COLOR_BOX">Hộp giấy màu</option>
             <option value="CARTON_BW">Thùng Carton</option>
          </select>
          <button onClick={() => setPackagingStep(2)} className="w-full py-4 bg-orange-500 text-white font-bold rounded-xl uppercase text-xs">Tiếp tục</button>
        </div>
      )}
      {packagingStep === 2 && (
        <div className="space-y-4">
           <div onClick={() => { pendingPackagingFace.current = 'flat'; packagingFileRef.current?.click(); }} className="h-40 bg-white/5 border-2 border-dashed border-white/10 rounded-xl flex items-center justify-center cursor-pointer overflow-hidden">
             {settings.packagingFaces.flat ? <img src={settings.packagingFaces.flat} className="h-full object-contain" /> : <span className="text-slate-400 text-xs font-bold uppercase">+ File thiết kế phẳng</span>}
           </div>
           <input type="file" hidden ref={packagingFileRef} onChange={e => onImageUpload(e, 'packaging')} />
           <button onClick={() => setPackagingStep(3)} className="w-full py-4 bg-orange-500 text-white font-bold rounded-xl uppercase text-xs">Tiếp tục</button>
        </div>
      )}
      {packagingStep === 3 && (
        <div className="space-y-4">
           <select className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none" value={settings.packagingOutputStyle} onChange={e => setSettings({...settings, packagingOutputStyle: e.target.value as any})}>
             <option value="WHITE_BG_ROTATED">Nền trắng xoay</option>
             <option value="CONTEXTUAL">Lifestyle Context</option>
           </select>
           <button onClick={startGeneration} className="w-full py-4 bg-orange-500 text-white font-bold rounded-xl uppercase text-xs">Tạo ảnh</button>
        </div>
      )}
    </section>
  );

  // 6. Xử lý chữ ký hình ảnh Workflow (Tech Effects)
  const renderTechEffectsWorkflow = () => (
    <section className="animate-fade-in space-y-6">
      <div className="space-y-1"><h2 className="text-xl font-bold text-white">Xử lý chữ ký hình ảnh</h2></div>
      <div className="flex gap-2">
         <button onClick={() => { setSettings({...settings, techEffectType: 'REMOVE_SIGNATURE'}); setTechEffectStep(1); }} className={`flex-1 py-2 rounded-lg text-[10px] font-bold border transition-all ${settings.techEffectType === 'REMOVE_SIGNATURE' ? 'bg-cyan-500/20 border-cyan-400' : 'border-white/10'}`}>Xóa chữ ký</button>
         <button onClick={() => { setSettings({...settings, techEffectType: 'SEA_TECH_GENERATION'}); setTechEffectStep(1); }} className={`flex-1 py-2 rounded-lg text-[10px] font-bold border transition-all ${settings.techEffectType === 'SEA_TECH_GENERATION' ? 'bg-cyan-500/20 border-cyan-400' : 'border-white/10'}`}>Biển đêm</button>
      </div>
      {settings.techEffectType === 'REMOVE_SIGNATURE' ? (
        <div className="space-y-4">
           <div onClick={() => refFileRef.current?.click()} className="h-48 bg-white/5 border-2 border-dashed border-white/10 rounded-xl flex items-center justify-center cursor-pointer overflow-hidden">
             {settings.referenceImage ? <img src={settings.referenceImage} className="h-full w-full object-contain" /> : <span className="text-slate-400 text-xs font-bold uppercase">+ Ảnh cần xử lý</span>}
           </div>
           <input type="file" hidden ref={refFileRef} accept="image/*" onChange={e => onImageUpload(e, 'reference')} />
           <button onClick={startGeneration} className="w-full py-4 bg-cyan-500 text-black font-bold rounded-xl uppercase text-xs">Tạo ảnh</button>
        </div>
      ) : (
        <div className="space-y-4">
           {techEffectStep === 1 && (
             <div className="space-y-4">
               <input type="text" placeholder="Tên SP..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white" value={settings.productName} onChange={e => setSettings({...settings, productName: e.target.value})} />
               <input type="text" placeholder="Tiêu đề..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white" value={settings.techTitle} onChange={e => setSettings({...settings, techTitle: e.target.value})} />
               <button onClick={handleSeaConceptSuggestion} className="w-full py-4 bg-cyan-500 text-black font-bold rounded-xl uppercase text-xs">Concept</button>
             </div>
           )}
           {techEffectStep === 3 && (
             <div className="space-y-4">
                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                  {suggestions.concepts.map(c => (
                    <button key={c} onClick={() => setSettings({...settings, selectedTechConcept: c})} className={`w-full text-left p-3 rounded-xl border text-[10px] transition-all ${settings.selectedTechConcept === c ? 'bg-cyan-500 text-black border-cyan-400' : 'bg-white/5 border-white/10'}`}>{c}</button>
                  ))}
                </div>
                <button onClick={startGeneration} className="w-full py-4 bg-cyan-500 text-black font-bold rounded-xl uppercase text-xs">Tạo ảnh</button>
             </div>
           )}
        </div>
      )}
    </section>
  );

  // 7. Làm ảnh nền trắng Workflow (White BG Retouch)
  const renderWhiteBgRetouchWorkflow = () => (
    <section className="animate-fade-in space-y-6">
      <div className="space-y-1"><h2 className="text-xl font-bold text-white">Làm ảnh nền trắng</h2></div>
      <div className="space-y-4">
        <div>
          <label className="block text-[9px] font-bold text-slate-400 uppercase mb-2">Thông tin cơ bản</label>
          <input type="text" placeholder="Tên sản phẩm..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-white" value={settings.productName} onChange={e => setSettings({...settings, productName: e.target.value})} />
        </div>
        
        <div>
          <label className="block text-[9px] font-bold text-slate-400 uppercase mb-2">Chất liệu bề mặt</label>
          <select className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-white" value={settings.productMaterial} onChange={e => setSettings({...settings, productMaterial: e.target.value as any})}>
             <option value="MATTE">Matte (Nhám / Lì)</option>
             <option value="GLOSSY">Glossy (Bóng)</option>
             <option value="GLASS">Glass (Trong suốt / Thủy tinh)</option>
             <option value="STAINLESS_STEEL">Stainless Steel (Inox / Kim loại)</option>
          </select>
        </div>

        <div>
          <label className="block text-[9px] font-bold text-slate-400 uppercase mb-2">Ảnh sản phẩm gốc</label>
          <div onClick={() => refFileRef.current?.click()} className="h-48 bg-white/5 border-2 border-dashed border-white/10 rounded-xl flex items-center justify-center cursor-pointer overflow-hidden group relative">
             {settings.referenceImage ? (
               <>
                 <img src={settings.referenceImage} className="h-full w-full object-contain" />
                 <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center text-xs font-bold">Thay ảnh</div>
               </>
             ) : <span className="text-slate-400 text-xs font-bold uppercase">+ Tải ảnh SP gốc</span>}
          </div>
          <input type="file" hidden ref={refFileRef} accept="image/*" onChange={e => onImageUpload(e, 'reference')} />
        </div>

        <div>
           <label className="block text-[9px] font-bold text-slate-400 uppercase mb-2">Yêu cầu bổ sung (Tùy chọn)</label>
           <textarea placeholder="Ví dụ: Làm sạch bụi trên vỏ, tăng độ bóng cho phần inox, làm sáng logo..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-white resize-none h-24" value={settings.concept} onChange={e => setSettings({...settings, concept: e.target.value})} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
             <label className="block text-[9px] font-bold text-slate-400 uppercase mb-2">Kích thước ảnh</label>
             <select className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-white" value={settings.imageSize} onChange={e => setSettings({...settings, imageSize: e.target.value as ImageSize})}>
                <option value="1K">1K Standard</option>
                <option value="2K">2K Pro</option>
                <option value="4K">4K Ultra HD</option>
             </select>
          </div>
          <div>
             <label className="block text-[9px] font-bold text-slate-400 uppercase mb-2">Tỷ lệ</label>
             <select className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-white" value={settings.aspectRatio} onChange={e => setSettings({...settings, aspectRatio: e.target.value as AspectRatio})}>
                <option value="1:1">1:1 Vuông</option>
                <option value="4:3">4:3 Catalog</option>
                <option value="3:4">3:4 Portrait</option>
                <option value="16:9">16:9 HD</option>
                <option value="9:16">9:16</option>
                <option value="1:4">1:4 Siêu dài</option>
                <option value="4:1">4:1 Siêu rộng</option>
             </select>
          </div>
        </div>

        <button onClick={startGeneration} className="w-full py-4 bg-white text-black font-bold rounded-xl uppercase text-xs tracking-widest shadow-lg hover:bg-slate-100 transition-all mt-4">Tạo ảnh</button>
      </div>
    </section>
  );

  // 8. Tạo hình ảnh chụp trong studio Workflow
  const renderStudioWorkflow = () => (
    <section className="animate-fade-in space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map(step => (
            <div key={step} className={`h-1 flex-1 rounded-full ${studioStep >= step ? 'bg-emerald-400' : 'bg-white/10'}`}></div>
          ))}
        </div>
        <h2 className="text-xl font-bold text-white mt-2">
           {studioStep === 1 ? "Bước 1: Nhập dữ liệu" : 
            studioStep === 2 ? "Bước 2: Chọn Concept Studio" : 
            studioStep === 3 ? "Bước 3: Đạo cụ & Bố cục" : "Bước 4: Camera & Xuất bản"}
        </h2>
      </div>

      {studioStep === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-2">Thông tin sản phẩm</label>
            <input type="text" placeholder="Tên sản phẩm..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-emerald-400" value={settings.productName} onChange={e => setSettings({...settings, productName: e.target.value})} />
            <div className="grid grid-cols-3 gap-2 mt-2">
               {['length', 'width', 'height'].map(f => (
                 <input key={f} type="number" placeholder={f === 'length' ? 'Dài' : f === 'width' ? 'Rộng' : 'Cao'} className="bg-white/5 border border-white/10 rounded-lg p-2 text-xs text-white outline-none focus:border-emerald-400" value={(settings.dimensions as any)[f]} onChange={e => setSettings({...settings, dimensions: {...settings.dimensions, [f]: e.target.value}})} />
               ))}
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase mb-2">Ảnh sản phẩm (Nền trắng hoặc ảnh chụp điện thoại)</label>
            <div className="grid grid-cols-5 gap-2">
               {settings.productImages.map((img, i) => (
                 <div key={i} className="aspect-square bg-white/5 border border-white/10 rounded-lg overflow-hidden relative group">
                   <img src={img} className="w-full h-full object-cover" />
                   <button onClick={() => setSettings(s => ({...s, productImages: s.productImages.filter((_, idx) => idx !== i)}))} className="absolute inset-0 bg-red-500/80 opacity-0 group-hover:opacity-100 transition-all text-xs">✕</button>
                 </div>
               ))}
               {settings.productImages.length < 5 && (
                 <button onClick={() => productFilesRef.current?.click()} className="aspect-square border-2 border-dashed border-white/10 rounded-lg text-white flex items-center justify-center hover:border-emerald-400">+</button>
               )}
            </div>
            <input type="file" hidden ref={productFilesRef} accept="image/*" multiple onChange={e => onImageUpload(e, 'product')} />
          </div>

          <button onClick={handleStudioAnalysis} className="w-full py-4 bg-emerald-500 text-[#051610] font-bold rounded-xl uppercase text-xs shadow-lg hover:brightness-110 transition-all">Tiếp tục</button>
        </div>
      )}

      {studioStep === 2 && (
        <div className="space-y-4">
           <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
             {suggestions.concepts.map(c => (
               <button key={c} onClick={() => setSettings({...settings, concept: c})} className={`w-full text-left p-4 rounded-xl border text-[10px] leading-relaxed transition-all ${settings.concept === c ? 'bg-emerald-400 text-[#051610] border-emerald-400' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}>{c}</button>
             ))}
           </div>
           
           <div className="pt-4 border-t border-white/10 space-y-2">
              <label className="block text-[9px] font-bold text-slate-400 uppercase">Chỉnh sửa hoặc mô tả thêm về concept</label>
              <textarea 
                placeholder="Mô tả chi tiết hơn hoặc chỉnh sửa concept..." 
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-emerald-400 resize-none h-24" 
                value={settings.concept} 
                onChange={e => setSettings({...settings, concept: e.target.value})} 
              />
           </div>

           <div className="flex gap-2 pt-2">
              <button onClick={() => setStudioStep(1)} className="flex-1 py-4 border border-white/10 text-white rounded-xl uppercase text-[10px] font-bold">Quay lại</button>
              <button onClick={handleStudioPropSuggestion} className="flex-[2] bg-emerald-500 text-[#051610] font-bold rounded-xl uppercase text-xs">Tiếp tục</button>
           </div>
        </div>
      )}

      {studioStep === 3 && (
        <div className="space-y-5">
          <div className="bg-emerald-400/10 p-3 rounded-xl border border-emerald-400/20">
             <div className="text-[8px] font-bold text-emerald-400 uppercase mb-1">Concept Studio đã chọn:</div>
             <div className="text-[10px] text-white italic">"{settings.concept}"</div>
          </div>

          <div>
             <label className="block text-[9px] font-bold text-slate-400 uppercase mb-2">Vị trí để trống chèn Text (Chọn nhiều)</label>
             <div className="grid grid-cols-2 gap-2">
                {[
                  {id: 'TOP', label: 'Ở trên'},
                  {id: 'BOTTOM', label: 'Ở dưới'},
                  {id: 'LEFT', label: 'Bên trái'},
                  {id: 'RIGHT', label: 'Bên phải'},
                  {id: 'NONE', label: 'Không để trống'}
                ].map(pos => {
                  const isSelected = settings.emptySpacePosition.includes(pos.id as any);
                  return (
                    <button 
                      key={pos.id} 
                      onClick={() => {
                        if (pos.id === 'NONE') {
                          setSettings({...settings, emptySpacePosition: ['NONE']});
                        } else {
                          const current = settings.emptySpacePosition.filter(p => p !== 'NONE');
                          const next = isSelected ? current.filter(p => p !== pos.id) : [...current, pos.id as any];
                          setSettings({...settings, emptySpacePosition: next.length === 0 ? ['NONE'] : next});
                        }
                      }} 
                      className={`py-2 rounded-lg border text-[9px] font-bold transition-all ${isSelected ? 'bg-emerald-400 text-[#051610] border-emerald-400' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}
                    >
                      {pos.label}
                    </button>
                  );
                })}
             </div>
          </div>

          <div>
             <label className="block text-[9px] font-bold text-slate-400 uppercase mb-2">Gợi ý đạo cụ Studio</label>
             <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                {suggestions.props.map(p => (
                  <button key={p} onClick={() => toggleProp(p)} className={`px-3 py-2 rounded-lg border text-[9px] font-bold transition-all ${settings.props.some(i => i.name === p) ? 'bg-emerald-400 text-[#051610] border-emerald-400' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}>{p}</button>
                ))}
             </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/10">
             <label className="block text-[9px] font-bold text-slate-400 uppercase">Thêm đạo cụ khác</label>
             <div className="flex gap-2">
                <input type="text" placeholder="Nhập tên đạo cụ..." className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 text-xs text-white outline-none focus:border-emerald-400" value={customProp} onChange={e => setCustomProp(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomPropToList()} />
                <button onClick={addCustomPropToList} className="px-5 bg-white/10 rounded-xl text-white font-bold hover:bg-white/20 transition-all">+</button>
             </div>
          </div>

          {renderSelectedProps()}

          <div className="flex gap-2">
              <button onClick={() => setStudioStep(2)} className="flex-1 py-4 border border-white/10 text-white rounded-xl uppercase text-[10px] font-bold">Quay lại</button>
              <button onClick={() => setStudioStep(4)} className="flex-[2] bg-emerald-500 text-[#051610] font-bold rounded-xl uppercase text-xs">Tiếp tục</button>
          </div>
        </div>
      )}

      {studioStep === 4 && renderCameraSettings(() => setStudioStep(3))}
    </section>
  );

  // 9. Phối cảnh Thanh ray & Ổ cắm Workflow
  const renderTrackSocketWorkflow = () => (
    <section className="animate-fade-in space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {[1, 2, 3].map(step => (
            <div key={step} className={`h-1 flex-1 rounded-full ${trackSocketStep >= step ? 'bg-blue-400' : 'bg-white/10'}`}></div>
          ))}
        </div>
        <h2 className="text-xl font-bold text-white mt-2">
           {trackSocketStep === 1 ? "Bước 1: Tải ảnh sản phẩm" : 
            trackSocketStep === 2 ? "Bước 2: Chọn bối cảnh" : "Bước 3: Camera & Xuất bản"}
        </h2>
      </div>

      {trackSocketStep === 1 && (
        <div className="space-y-4">
          <div className="flex gap-4 mb-2">
             <button onClick={() => setSettings({...settings, trackSocketMode: 'CREATIVE'})} className={`flex-1 p-3 rounded-xl border text-xs font-bold transition-all ${settings.trackSocketMode === 'CREATIVE' || !settings.trackSocketMode ? 'bg-blue-500 text-white border-blue-500' : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'}`}>Tự sáng tạo ảnh</button>
             <button onClick={() => setSettings({...settings, trackSocketMode: 'REFERENCE'})} className={`flex-1 p-3 rounded-xl border text-xs font-bold transition-all ${settings.trackSocketMode === 'REFERENCE' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'}`}>Tạo theo mẫu sẵn</button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-[9px] font-bold text-slate-400 uppercase">Ảnh Thanh ray (Cố định gắn tường)</label>
              <div onClick={() => trackFileRef.current?.click()} className="h-24 w-full bg-white/5 border-2 border-dashed border-white/10 rounded-2xl flex items-center justify-center cursor-pointer overflow-hidden">
                {settings.trackImage ? <img src={settings.trackImage} className="w-full h-full object-contain" /> : <span className="text-blue-400 font-bold text-[10px] uppercase">+ Tải ảnh Thanh ray</span>}
              </div>
              <input type="file" hidden ref={trackFileRef} accept="image/*" onChange={e => onImageUpload(e, 'track')} />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="block text-[9px] font-bold text-slate-400 uppercase">Danh sách Ổ cắm</label>
                <button onClick={() => socketFileRef.current?.click()} className="text-[10px] text-blue-400 font-bold uppercase hover:text-blue-300">+ Thêm Ổ cắm</button>
              </div>
              <input type="file" hidden ref={socketFileRef} accept="image/*" onChange={e => onImageUpload(e, 'socket')} />
              
              <div className="space-y-3">
                {settings.sockets?.map((socket, idx) => (
                  <div key={socket.id} className="bg-white/5 border border-white/10 rounded-xl p-3 flex gap-3 items-start">
                    <div className="w-16 h-16 bg-black/20 rounded-lg overflow-hidden shrink-0">
                      <img src={socket.image} className="w-full h-full object-contain" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-white">Loại ổ cắm {idx + 1}</span>
                        <button onClick={() => setSettings(s => ({...s, sockets: s.sockets?.filter(sk => sk.id !== socket.id)}))} className="text-red-400 text-xs hover:text-red-300">Xóa</button>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] text-slate-400">Số lượng:</label>
                        <input type="number" min="1" value={socket.quantity} onChange={e => {
                          const newSockets = [...(settings.sockets || [])];
                          newSockets[idx].quantity = parseInt(e.target.value) || 1;
                          setSettings({...settings, sockets: newSockets});
                        }} className="w-16 bg-black/20 border border-white/10 rounded p-1 text-xs text-white outline-none" />
                      </div>
                      <input type="text" placeholder="Ghi chú thiết bị cắm vào (VD: Tivi, Đèn bàn...)" value={socket.applianceNote} onChange={e => {
                        const newSockets = [...(settings.sockets || [])];
                        newSockets[idx].applianceNote = e.target.value;
                        setSettings({...settings, sockets: newSockets});
                      }} className="w-full bg-black/20 border border-white/10 rounded p-2 text-xs text-white outline-none focus:border-blue-400" />
                    </div>
                  </div>
                ))}
                {(!settings.sockets || settings.sockets.length === 0) && (
                  <div className="text-center p-4 border border-dashed border-white/10 rounded-xl text-slate-500 text-xs">
                    Chưa có ổ cắm nào. Hãy thêm ít nhất 1 ổ cắm.
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {settings.trackSocketMode === 'REFERENCE' && (
            <div className="space-y-2">
              <label className="block text-[9px] font-bold text-slate-400 uppercase">Ảnh Mẫu (Reference Image)</label>
              <div onClick={() => refFileRef.current?.click()} className="h-24 w-full bg-white/5 border-2 border-dashed border-white/10 rounded-2xl flex items-center justify-center cursor-pointer overflow-hidden">
                {settings.referenceImage ? <img src={settings.referenceImage} className="w-full h-full object-contain" /> : <span className="text-blue-400 font-bold text-[10px] uppercase">+ Tải ảnh mẫu</span>}
              </div>
              <input type="file" hidden ref={refFileRef} accept="image/*" onChange={e => onImageUpload(e, 'reference')} />
            </div>
          )}
          
          <input type="text" placeholder="Tên sản phẩm (VD: Thanh ray Chargee V2...)" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-blue-400" value={settings.productName} onChange={e => setSettings({...settings, productName: e.target.value})} />

          <button onClick={() => { 
            if(!settings.trackImage || !settings.sockets?.length) return alert("Vui lòng tải đủ ảnh thanh ray và ít nhất 1 ổ cắm."); 
            if(settings.trackSocketMode === 'REFERENCE' && !settings.referenceImage) return alert("Vui lòng tải ảnh mẫu.");
            if(settings.trackSocketMode === 'REFERENCE') setTrackSocketStep(3);
            else setTrackSocketStep(2); 
          }} className="w-full py-4 bg-blue-500 text-white font-bold rounded-xl uppercase text-xs shadow-lg hover:brightness-110 transition-all">
            {settings.trackSocketMode === 'REFERENCE' ? 'Tiếp tục' : 'Tiếp tục'}
          </button>
        </div>
      )}

      {trackSocketStep === 2 && (
        <div className="space-y-4">
          <label className="block text-[9px] font-bold text-slate-400 uppercase">Chọn bối cảnh ứng dụng</label>
          <div className="grid grid-cols-2 gap-2">
            {['Phòng khách hiện đại', 'Phòng ngủ ấm cúng', 'Bàn làm việc tối giản', 'Khu vực bếp tiện nghi', 'Kệ Tivi sang trọng', 'Văn phòng chuyên nghiệp'].map(loc => (
              <button key={loc} onClick={() => setSettings({...settings, location: loc})} className={`p-3 rounded-xl border text-[10px] transition-all ${settings.location === loc ? 'bg-blue-400 text-white border-blue-400' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}>{loc}</button>
            ))}
          </div>
          <textarea placeholder="Mô tả thêm về bối cảnh (Tùy chọn)..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-blue-400 resize-none h-20" value={settings.concept} onChange={e => setSettings({...settings, concept: e.target.value})} />
          
          <div className="flex gap-2">
            <button onClick={() => setTrackSocketStep(1)} className="flex-1 py-4 border border-white/10 text-white rounded-xl uppercase text-[10px] font-bold">Quay lại</button>
            <button onClick={() => { if(!settings.location) return alert("Vui lòng chọn bối cảnh."); setTrackSocketStep(3); }} className="flex-[2] bg-blue-500 text-white font-bold rounded-xl uppercase text-xs">Tiếp tục</button>
          </div>
        </div>
      )}

      {trackSocketStep === 3 && renderCameraSettings(() => setTrackSocketStep(settings.trackSocketMode === 'REFERENCE' ? 1 : 2))}
    </section>
  );

  const renderInstructions = () => {
    if (currentStep === 1) {
      return (
        <div className="text-center max-w-lg z-10 space-y-4 px-6">
          <h3 className="text-xl font-bold text-white uppercase tracking-tighter">Bắt đầu quy trình sáng tạo</h3>
          <p className="text-slate-300 font-medium text-sm leading-relaxed">Chọn một trong các chế độ phía bên trái để trải nghiệm quy trình làm việc chuyên nghiệp được tối ưu bởi Gemini 3 Pro.</p>
        </div>
      );
    }

    let title = "";
    let steps: string[] = [];

    switch (settings.visualStyle) {
      case 'COLOR_CHANGE':
        title = "Hướng dẫn: Làm màu sản phẩm";
        steps = [
          "Tải lên hình ảnh sản phẩm cần đổi màu.",
          "Nhập màu sắc mong muốn (ví dụ: Đỏ mận, Xanh navy).",
          "Nhấn 'Tạo ảnh' để hệ thống xử lý đổi màu giữ nguyên chất liệu."
        ];
        break;
      case 'WHITE_BG_RETOUCH':
        title = "Hướng dẫn: Làm ảnh nền trắng";
        steps = [
          "Tải lên hình ảnh sản phẩm cần tách nền.",
          "Hệ thống sẽ tự động tách nền và tái tạo ánh sáng studio.",
          "Nhấn 'Tạo ảnh' để nhận kết quả nền trắng chuyên nghiệp."
        ];
        break;
      case 'STUDIO':
        title = "Hướng dẫn: Làm ảnh trong studio";
        steps = [
          "Nhập tên sản phẩm và tải lên hình ảnh sản phẩm gốc.",
          "Hệ thống AI sẽ phân tích và đề xuất các concept chụp ảnh studio phù hợp.",
          "Lựa chọn đạo cụ (props) trang trí đi kèm để làm nổi bật sản phẩm.",
          "Thiết lập góc máy camera và nhấn 'Tạo ảnh' để kết xuất kết quả cuối cùng."
        ];
        break;
      case 'TECH_PS':
        title = "Hướng dẫn: Làm ảnh USP";
        steps = [
          "Nhập tên sản phẩm và mô tả tính năng kỹ thuật nổi bật.",
          "Tải lên ảnh sản phẩm.",
          "Chọn hiệu ứng hình ảnh (Visual Elements) để làm nổi bật USP.",
          "Nhấn 'Tạo ảnh' để hoàn tất."
        ];
        break;
      case 'PACKAGING_MOCKUP':
        title = "Hướng dẫn: Dựng mockup sản phẩm";
        steps = [
          "Tải lên file thiết kế phẳng của bao bì.",
          "Chọn loại hộp và tỷ lệ khung hình.",
          "Chọn góc nhìn và bối cảnh đặt mockup.",
          "Nhấn 'Tạo ảnh' để dựng hình 3D."
        ];
        break;
      case 'TRACK_SOCKET_STAGING':
        title = "Hướng dẫn: Làm ảnh Thanh ray ổ cắm";
        steps = [
          "Chọn chế độ tạo (Dựng phối cảnh AI hoặc Ghép vào ảnh thực tế).",
          "Tải lên ảnh thanh ray và ổ cắm.",
          "Thiết lập bối cảnh và góc máy.",
          "Nhấn 'Tạo ảnh' để render."
        ];
        break;
      case 'SCENE_STAGING':
        title = "Hướng dẫn: Xây dựng phối cảnh";
        steps = [
          "Tải lên ảnh không gian thực tế và ảnh sản phẩm.",
          "Nhập mô tả concept mong muốn.",
          "AI sẽ phân tích và đề xuất các vật dụng trang trí (props).",
          "Nhấn 'Tạo ảnh' để ghép sản phẩm vào không gian."
        ];
        break;
      case 'TECH_EFFECTS':
        title = "Hướng dẫn: Xử lý ảnh có chữ ký";
        steps = [
          "Chọn loại xử lý (Xóa Watermark hoặc Tạo hiệu ứng mặt biển).",
          "Tải lên hình ảnh cần xử lý.",
          "Nhấn 'Tạo ảnh' để hệ thống thực hiện."
        ];
        break;
      case 'CONCEPT':
        title = "Hướng dẫn: Ảnh concept";
        steps = [
          "Nhập tên sản phẩm và tải lên ảnh sản phẩm.",
          "AI sẽ phân tích và đề xuất các concept sáng tạo.",
          "Chọn đạo cụ và góc máy phù hợp với concept.",
          "Nhấn 'Tạo ảnh' để render."
        ];
        break;
      default:
        title = "Hướng dẫn sử dụng";
        steps = ["Vui lòng làm theo các bước ở thanh công cụ bên trái."];
    }

    return (
      <div className="text-left max-w-2xl z-10 space-y-6 px-8 py-8 bg-black/40 backdrop-blur-md rounded-3xl border border-white/10 shadow-2xl animate-fade-in">
        <h3 className="text-2xl font-bold text-white uppercase tracking-tighter border-b border-white/10 pb-4">{title}</h3>
        <ul className="space-y-4">
          {steps.map((step, idx) => (
            <li key={idx} className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#caf0f8] to-cyan-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-cyan-500/20">
                <span className="text-[#051610] text-sm font-black">{idx + 1}</span>
              </div>
              <span className="text-slate-200 font-medium text-[15px] leading-relaxed pt-1">{step}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const renderSidebar = () => {
    if (currentStep === 1) {
      return (
        <div className="space-y-6 animate-fade-in">
          <h2 className="text-2xl font-bold text-white tracking-tight">Chọn chế độ sáng tạo</h2>
          <div className="space-y-2">
             <button onClick={() => { setSettings(s => ({...s, visualStyle: 'COLOR_CHANGE'})); setCurrentStep(2); }} className="w-full text-left p-3 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 hover:border-[#caf0f8]/50 transition-all group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-lg">🌈</div>
                  <div><h3 className="font-bold text-white text-sm">Làm màu sản phẩm</h3><p className="text-[10px] text-slate-400 mt-0.5">Đổi màu giữ nguyên texture.</p></div>
                </div>
             </button>
             <button onClick={() => { setSettings(s => ({...s, visualStyle: 'WHITE_BG_RETOUCH'})); setWhiteBgStep(1); setCurrentStep(2); }} className="w-full text-left p-3 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 hover:border-white/50 transition-all group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-lg">💡</div>
                  <div><h3 className="font-bold text-white text-sm">Làm ảnh nền trắng</h3><p className="text-[10px] text-slate-400 mt-0.5">Làm sạch & tái tạo ánh sáng studio.</p></div>
                </div>
             </button>
             <button onClick={() => { setSettings(s => ({...s, visualStyle: 'STUDIO'})); setStudioStep(1); setCurrentStep(2); }} className="w-full text-left p-3 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/20 hover:border-emerald-400 transition-all group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-lg">📸</div>
                  <div><h3 className="font-bold text-white text-sm">Làm ảnh trong studio</h3><p className="text-[10px] text-slate-400 mt-0.5">Tạo ảnh sản phẩm nền pastel tối giản.</p></div>
                </div>
             </button>
             <button onClick={() => { setSettings(s => ({...s, visualStyle: 'TECH_PS'})); setTechStep(1); setCurrentStep(2); }} className="w-full text-left p-3 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 hover:border-[#2d6a4f]/50 transition-all group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#2d6a4f]/20 flex items-center justify-center text-lg">⚙️</div>
                  <div><h3 className="font-bold text-white text-sm">Làm ảnh USP</h3><p className="text-[10px] text-slate-400 mt-0.5">Diễn tả tính năng kỹ thuật cao cấp.</p></div>
                </div>
             </button>
             <button onClick={() => { setSettings(s => ({...s, visualStyle: 'PACKAGING_MOCKUP'})); setPackagingStep(1); setCurrentStep(2); }} className="w-full text-left p-3 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 hover:border-orange-400/50 transition-all group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-lg">📦</div>
                  <div><h3 className="font-bold text-white text-sm">Dựng mockup sản phẩm</h3><p className="text-[10px] text-slate-400 mt-0.5">Dựng hộp 3D từ file phẳng.</p></div>
                </div>
             </button>
             <button onClick={() => { setSettings(s => ({...s, visualStyle: 'TRACK_SOCKET_STAGING'})); setTrackSocketStep(1); setCurrentStep(2); }} className="w-full text-left p-3 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 border border-blue-500/20 hover:border-blue-400 transition-all group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-lg">🔌</div>
                  <div><h3 className="font-bold text-white text-sm">Làm ảnh Thanh ray ổ cắm</h3><p className="text-[10px] text-slate-400 mt-0.5">Ghép ổ cắm lên thanh ray và dựng phối cảnh.</p></div>
                </div>
             </button>
             <button onClick={() => { setSettings(s => ({...s, visualStyle: 'SCENE_STAGING'})); setStagingStep(1); setCurrentStep(2); }} className="w-full text-left p-3 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-indigo-500/5 border border-indigo-500/20 hover:border-indigo-400 transition-all group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-lg">🏠</div>
                  <div><h3 className="font-bold text-white text-sm">Xây dựng phối cảnh</h3><p className="text-[10px] text-slate-400 mt-0.5">Dựng phối cảnh từ ảnh thực tế.</p></div>
                </div>
             </button>
             <button onClick={() => { setSettings(s => ({...s, visualStyle: 'TECH_EFFECTS'})); setTechEffectStep(1); setCurrentStep(2); }} className="w-full text-left p-3 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 hover:border-cyan-400/50 transition-all group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-lg">🔮</div>
                  <div><h3 className="font-bold text-white text-sm">Xử lý ảnh có chữ ký</h3><p className="text-[10px] text-slate-400 mt-0.5">Xóa watermark hoặc tạo hiệu ứng biển.</p></div>
                </div>
             </button>
             <button onClick={() => { setSettings(s => ({...s, visualStyle: 'CONCEPT'})); setConceptStep(1); setCurrentStep(2); }} className="w-full text-left p-3 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 hover:border-[#caf0f8]/50 transition-all group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#caf0f8]/10 flex items-center justify-center text-lg">🎨</div>
                  <div><h3 className="font-bold text-white text-sm">Ảnh concept</h3><p className="text-[10px] text-slate-400 mt-0.5">Sáng tạo concept, tìm props & không gian.</p></div>
                </div>
             </button>
          </div>
        </div>
      );
    }
    
    return (
      <div className="animate-fade-in">
         <button onClick={resetMode} className="mb-6 flex items-center gap-2 text-[10px] font-bold uppercase text-slate-400 hover:text-white transition-colors"><span>←</span> Quay lại Menu</button>
         {settings.visualStyle === 'CONCEPT' && renderConceptWorkflow()}
         {settings.visualStyle === 'SCENE_STAGING' && renderStagingWorkflow()}
         {settings.visualStyle === 'TECH_PS' && renderTechWorkflow()}
         {settings.visualStyle === 'COLOR_CHANGE' && renderColorWorkflow()}
         {settings.visualStyle === 'PACKAGING_MOCKUP' && renderPackagingWorkflow()}
         {settings.visualStyle === 'TECH_EFFECTS' && renderTechEffectsWorkflow()}
         {settings.visualStyle === 'WHITE_BG_RETOUCH' && renderWhiteBgRetouchWorkflow()}
         {settings.visualStyle === 'STUDIO' && renderStudioWorkflow()}
         {settings.visualStyle === 'TRACK_SOCKET_STAGING' && renderTrackSocketWorkflow()}
      </div>
    );
  };

  const renderCameraSettings = (onBack: () => void) => (
    <div className="space-y-5">
      <div className="bg-white/5 rounded-xl p-4 space-y-4 border border-white/10">
         <div className="space-y-2">
            <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase"><span>Góc chụp</span><span className="text-[#caf0f8]">{settings.camera.angle}°</span></div>
            <input type="range" min="-15" max="90" step="5" className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer" value={settings.camera.angle} onChange={e => setSettings({...settings, camera: {...settings.camera, angle: parseInt(e.target.value)}})} />
         </div>
         <div className="space-y-2">
            <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase"><span>Tiêu cự</span><span className="text-[#caf0f8]">{settings.camera.focalLength}mm</span></div>
            <input type="range" min="12" max="200" step="1" className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer" value={settings.camera.focalLength} onChange={e => setSettings({...settings, camera: {...settings.camera, focalLength: parseInt(e.target.value)}})} />
         </div>
         <div className="grid grid-cols-2 gap-3">
           <div>
              <label className="block text-[8px] font-bold text-slate-400 uppercase mb-1">Khẩu độ</label>
              <select className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-[10px] text-white outline-none focus:border-[#caf0f8]" value={settings.camera.aperture} onChange={e => setSettings({...settings, camera: {...settings.camera, aperture: e.target.value}})}>
                {CAMERA_APERTURES.map(a => <option key={a} value={a} className="bg-[#051610]">{a}</option>)}
              </select>
           </div>
           <div>
              <label className="block text-[8px] font-bold text-slate-400 uppercase mb-1">ISO</label>
              <select className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-[10px] text-white outline-none focus:border-[#caf0f8]" value={settings.camera.iso} onChange={e => setSettings({...settings, camera: {...settings.camera, iso: e.target.value}})}>
                {CAMERA_ISO.map(i => <option key={i} value={i} className="bg-[#051610]">{i}</option>)}
              </select>
           </div>
         </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
           <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Tỷ lệ</label>
           <select className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-[10px] text-white outline-none" value={settings.aspectRatio} onChange={e => setSettings({...settings, aspectRatio: e.target.value as AspectRatio})}>
              <option value="1:1" className="bg-[#051610]">1:1 Vuông</option><option value="16:9" className="bg-[#051610]">16:9 HD</option><option value="9:16" className="bg-[#051610]">9:16</option><option value="4:3" className="bg-[#051610]">4:3</option><option value="3:4" className="bg-[#051610]">3:4</option><option value="1:4" className="bg-[#051610]">1:4</option><option value="4:1" className="bg-[#051610]">4:1</option>
           </select>
        </div>
        <div>
           <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Chất lượng</label>
           <select className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-[10px] text-white outline-none" value={settings.imageSize} onChange={e => setSettings({...settings, imageSize: e.target.value as ImageSize})}>
              <option value="1K" className="bg-[#051610]">1K Standard</option><option value="2K" className="bg-[#051610]">2K Pro</option><option value="4K" className="bg-[#051610]">4K Ultra</option>
           </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onBack} className="flex-1 py-4 border border-white/10 text-white rounded-xl uppercase text-[10px] font-bold">Quay lại</button>
        <button onClick={startGeneration} className="flex-[2] vibrant-button text-white font-bold py-4 rounded-xl uppercase text-[12px] shadow-xl">Tạo ảnh</button>
      </div>
    </div>
  );

  if (isLocked) {
    return (
      <div className="fixed inset-0 z-[150] bg-[#051610] flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full space-y-8 glass-card p-10 rounded-[40px] border border-white/10">
          <div className="w-20 h-20 bg-white/10 rounded-3xl mx-auto flex items-center justify-center"><span className="text-3xl">🔒</span></div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-white tracking-tighter">iOhK Agent</h1>
            <h2 className="text-lg font-bold text-[#caf0f8]">Bảo mật hệ thống</h2>
          </div>
          <div className="space-y-4">
            <input type="password" placeholder="Mật khẩu..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-center text-white tracking-[0.5em] outline-none" value={passwordInput} onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(""); }} onKeyDown={(e) => e.key === 'Enter' && handleUnlock()} />
            {passwordError && <p className="text-red-400 text-xs font-bold uppercase">{passwordError}</p>}
          </div>
          <button onClick={handleUnlock} className="w-full vibrant-button text-white font-bold py-4 rounded-[25px] uppercase text-[12px] shadow-xl">Mở khóa</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative animate-fade-in">
      <header className="px-6 py-4 flex justify-between items-center z-50 sticky top-0 bg-[#051610]/80 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center border border-white/20"><span className="text-white font-bold text-lg">iA</span></div>
          <div><h1 className="text-xl font-bold tracking-tighter text-white">iOhK Agent</h1><p className="text-[8px] font-bold text-[#caf0f8] tracking-[0.3em] uppercase">Creative Studio 2026</p></div>
        </div>
      </header>
      <main className="flex-1 flex flex-col lg:flex-row gap-6 p-6 max-w-[1600px] mx-auto w-full">
        <aside className="w-full lg:w-[420px] glass-card ray-running rounded-[35px] overflow-hidden lg:h-[calc(100vh-120px)] lg:sticky lg:top-24"><div className="p-6 h-full overflow-y-auto custom-scrollbar">{renderSidebar()}</div></aside>
        <section className="flex-1 flex flex-col gap-6">
          <div className="flex-1 glass-card ray-running rounded-[40px] p-8 flex items-center justify-center relative min-h-[400px]">
            {appState === AppState.GENERATING || appState === AppState.ANALYZING ? (
              <div className="text-center z-10 space-y-6 animate-pulse">
                <div className="relative w-32 h-32 mx-auto"><div className="absolute inset-0 border-[4px] border-[#caf0f8] border-t-transparent rounded-full animate-spin" /></div>
                <h3 className="text-xl font-bold text-white uppercase tracking-tighter">{loadingMessage}</h3>
              </div>
            ) : activeImage ? (
              <div className="relative z-10 flex flex-col items-center gap-6 animate-fade-in w-full">
                <div className="relative group max-w-full bg-black/20 rounded-[30px] p-2 flex justify-center"><img src={activeImage.url} alt="Masterpiece" className="max-h-[60vh] max-w-full block object-contain rounded-[28px] shadow-2xl" /></div>
                <div className="flex gap-4">
                  <div className="px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-[9px] font-bold uppercase tracking-widest text-[#caf0f8]">Phiên bản 0{activeImage.variant}</div>
                  <a href={activeImage.url} download={`iohk-ai-${activeImage.id}.png`} className="vibrant-button px-8 py-3 rounded-2xl text-[9px] font-bold uppercase tracking-widest text-white">Lưu ảnh ✨</a>
                </div>
              </div>
            ) : renderInstructions()}
          </div>
          <div className="flex gap-4 h-32 items-stretch">
            <div className="flex-1 glass-card ray-running rounded-[35px] p-4 flex gap-4 overflow-x-auto custom-scrollbar items-center">
                {gallery.length === 0 ? <div className="flex-1 flex items-center justify-center border-2 border-dashed border-white/5 rounded-[25px] opacity-20 h-full"><span className="text-[9px] font-bold uppercase tracking-[0.4em]">Bộ sưu tập</span></div> : gallery.map(img => <button key={img.id} onClick={() => setActiveImage(img)} className={`flex-shrink-0 w-24 h-24 rounded-2xl overflow-hidden border-2 transition-all ${activeImage?.id === img.id ? 'border-[#caf0f8]' : 'border-transparent opacity-40 hover:opacity-100'}`}><img src={img.url} className="w-full h-full object-cover" /></button>)}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;