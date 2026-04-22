import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';
import { 
  FileText, 
  Upload, 
  X, 
  Check, 
  Loader2, 
  Download, 
  RefreshCw, 
  Info,
  ChevronRight,
  Settings,
  Zap,
  ShieldCheck,
  LogIn,
  LogOut,
  User as UserIcon,
  FileType
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { analyzeFileContent, AnalysisResult } from './services/gemini';
import { auth, loginWithGoogle, logout } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface FileItem {
  id: string;
  file: File;
  status: 'idle' | 'analyzing' | 'done' | 'error';
  suggestedName: string;
  originalName: string;
  analysis?: AnalysisResult;
  error?: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [tokenUsage, setTokenUsage] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [userApiKey, setUserApiKey] = useState(() => localStorage.getItem('GEMINI_API_KEY') || '');
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const hasApiKey = !!process.env.GEMINI_API_KEY || !!userApiKey;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const saveApiKey = (key: string) => {
    setUserApiKey(key);
    localStorage.setItem('GEMINI_API_KEY', key);
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      status: 'idle' as const,
      suggestedName: '',
      originalName: file.name,
    }));
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/webp': ['.webp']
    }
  });

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = reader.result?.toString().split(',')[1];
        if (base64) resolve(base64);
        else reject(new Error('Failed to convert file to base64'));
      };
      reader.onerror = error => reject(error);
    });
  };

  const analyzeFile = async (id: string) => {
    const fileItem = files.find(f => f.id === id);
    if (!fileItem || fileItem.status === 'analyzing') return;

    setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'analyzing', error: undefined } : f));

    try {
      const base64 = await fileToBase64(fileItem.file);
      const result = await analyzeFileContent(fileItem.file, base64, fileItem.file.type, userApiKey);
      
      setTokenUsage(prev => prev + Math.floor(fileItem.file.size / 100) + 500);

      setFiles(prev => prev.map(f => f.id === id ? { 
        ...f, 
        status: 'done', 
        suggestedName: result.suggestedName,
        analysis: result
      } : f));
    } catch (err: any) {
      setFiles(prev => prev.map(f => f.id === id ? { 
        ...f, 
        status: 'error', 
        error: err.message || 'Analysis failed. Please try again.' 
      } : f));
    }
  };

  const analyzeAll = async () => {
    const idleFiles = files.filter(f => f.status === 'idle' || f.status === 'error');
    if (idleFiles.length === 0) return;

    setIsProcessingAll(true);
    
    // Concurrency limited processing (3 at a time)
    const concurrency = 3;
    const items = [...idleFiles];
    
    const worker = async () => {
      while (items.length > 0) {
        const item = items.shift();
        if (item) {
          await analyzeFile(item.id);
        }
      }
    };

    const workers = Array(Math.min(concurrency, items.length)).fill(null).map(worker);
    await Promise.all(workers);
    
    setIsProcessingAll(false);
  };

  const downloadFile = (fileItem: FileItem) => {
    const extension = fileItem.originalName.split('.').pop();
    const newName = `${fileItem.suggestedName || fileItem.originalName.split('.')[0]}.${extension}`;
    
    const url = URL.createObjectURL(fileItem.file);
    const a = document.createElement('a');
    a.href = url;
    a.download = newName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Helper to convert Image File to PDF Blob
  const imageToPdfBlob = async (imageFile: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const pdf = new jsPDF({
            orientation: img.width > img.height ? 'l' : 'p',
            unit: 'px',
            format: [img.width, img.height]
          });
          pdf.addImage(img, 'JPEG', 0, 0, img.width, img.height);
          resolve(pdf.output('blob'));
        };
        img.onerror = reject;
        if (e.target?.result) img.src = e.target.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(imageFile);
    });
  };

  // Helper to convert PDF File to first page JPG Blob
  const pdfToJpgBlob = async (pdfFile: File): Promise<Blob> => {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas context failed');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ 
      canvasContext: context, 
      viewport,
      //@ts-ignore - Some versions of pdfjs types expect canvas even if canvasContext is provided
      canvas 
    }).promise;
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
      }, 'image/jpeg', 0.8);
    });
  };

  const downloadAllZip = async (targetFormat: 'pdf' | 'jpg') => {
    const zip = new JSZip();
    const readyFiles = files.filter(f => f.status === 'done' || f.status === 'idle');
    
    if (readyFiles.length === 0) return;

    setIsProcessingAll(true);

    for (const fileItem of readyFiles) {
      const ext = fileItem.originalName.split('.').pop()?.toLowerCase();
      const baseName = fileItem.suggestedName || fileItem.originalName.split('.')[0];
      
      try {
        if (targetFormat === 'pdf') {
          if (ext === 'pdf') {
            zip.file(`${baseName}.pdf`, fileItem.file);
          } else {
            const pdfBlob = await imageToPdfBlob(fileItem.file);
            zip.file(`${baseName}.pdf`, pdfBlob);
          }
        } else if (targetFormat === 'jpg') {
          if (ext === 'pdf') {
            const jpgBlob = await pdfToJpgBlob(fileItem.file);
            zip.file(`${baseName}.jpg`, jpgBlob);
          } else {
            zip.file(`${baseName}.${ext}`, fileItem.file);
          }
        }
      } catch (err) {
        console.error(`Error processing ${fileItem.originalName} for zip:`, err);
        // Fallback: just add the original
        zip.file(fileItem.originalName, fileItem.file);
      }
    }

    const content = await zip.generateAsync({ 
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
    
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `renamed-files-${targetFormat}-${new Date().getTime()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsProcessingAll(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Petrolimex Header Bar */}
      <div className="bg-[#004a99] h-2 w-full"></div>
      <div className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#004a99] rounded-lg flex items-center justify-center text-white font-bold text-xl italic shadow-md">
              P
            </div>
            <div>
              <h1 className="font-bold text-[#004a99] leading-tight">PETROLIMEX</h1>
              <p className="text-[10px] text-slate-500 font-medium tracking-widest uppercase">NhonNguyen Smart-Renamer</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4">
            {isAuthLoading ? (
              <Loader2 className="animate-spin text-slate-300" size={20} />
            ) : user ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-xs font-bold text-slate-700">{user.displayName || user.email}</span>
                  <span className="text-[10px] text-emerald-600 font-bold uppercase">Online</span>
                </div>
                {user.photoURL && <img src={user.photoURL} alt="avatar" className="w-8 h-8 rounded-full border border-slate-200" />}
                <button 
                  onClick={logout}
                  className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full transition-colors"
                  title="Đăng xuất"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <button 
                onClick={loginWithGoogle}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#004a99] text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors"
              >
                <LogIn size={14} />
                <span>Đăng nhập</span>
              </button>
            )}

            <div className="h-6 w-[1px] bg-slate-200 mx-1"></div>

            <button 
              onClick={() => setShowSettings(true)}
              className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="bg-[#004a99] p-6 text-white">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Settings size={24} /> Thiết lập hệ thống
                  </h3>
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
                <p className="text-blue-100 text-sm">Cấu hình kết nối AI để xử lý tài liệu.</p>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 space-y-3">
                    <h4 className="text-sm font-bold text-[#004a99] flex items-center gap-2">
                      <Zap size={16} /> Gemini API Key
                    </h4>
                    <p className="text-[10px] text-slate-500">Sử dụng API Key cá nhân của bạn để xử lý không giới hạn.</p>
                    <div className="relative">
                      <input 
                        type="password"
                        value={userApiKey}
                        onChange={(e) => saveApiKey(e.target.value)}
                        placeholder="Dán API Key từ Google AI Studio..."
                        className="w-full bg-white border border-blue-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-[#004a99] outline-none pr-10"
                      />
                      {userApiKey && (
                        <button 
                          onClick={() => saveApiKey('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-red-500"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Thống kê phiên làm việc</p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Token ước tính:</span>
                      <span className="font-mono font-bold text-[#004a99]">{tokenUsage.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => setShowSettings(false)}
                  className="w-full py-3 bg-[#004a99] text-white font-bold rounded-2xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
                >
                  Đóng thiết lập
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="max-w-5xl mx-auto p-4 md:p-8">
        <header className="mb-10 text-center md:text-left flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
              Xử Lý <span className="text-[#f37021]">Lệnh Xuất Kho</span>
            </h2>
            <p className="text-slate-500 max-w-xl">
              Tự động trích xuất thông tin Petrolimex theo định dạng: <code className="bg-slate-100 px-1 rounded text-[10px] md:text-xs">20.8-26.8 62C03741 HO VAN VU 2k 2057732882</code>
            </p>
          </div>
          {user && (
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-2">
              <UserIcon size={16} className="text-[#004a99]" />
              <span className="text-xs font-bold text-slate-600 truncate max-w-[150px]">{user.email}</span>
            </div>
          )}
        </header>

        <main className="space-y-8">
          {/* Dropzone */}
          <section 
            {...getRootProps()} 
            className={cn(
              "relative group cursor-pointer transition-all duration-300",
              "border-2 border-dashed rounded-3xl p-12 text-center",
              isDragActive ? "border-[#f37021] bg-orange-50/50" : "border-slate-200 hover:border-[#004a99] bg-white hover:shadow-xl hover:shadow-blue-50"
            )}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-4">
              <div className={cn(
                "p-4 rounded-full transition-transform duration-300 group-hover:scale-110",
                isDragActive ? "bg-[#f37021] text-white" : "bg-slate-100 text-slate-400"
              )}>
                <Upload size={32} />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900">
                  {isDragActive ? "Thả tệp vào đây" : "Kéo thả nhiều Lệnh Xuất Kho để bắt đầu"}
                </p>
                <p className="text-slate-400 mt-1 text-sm">
                  Hỗ trợ PDF và tất cả định dạng ảnh
                </p>
              </div>
            </div>
          </section>

          {/* Action Bar */}
          {files.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm"
            >
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Trạng thái</span>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                  <FileText size={16} className="text-[#004a99]" />
                  <span>{files.length} tệp đã chọn</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button 
                  onClick={() => setFiles([])}
                  className="px-4 py-2 text-red-500 text-xs font-bold hover:bg-red-50 rounded-xl transition-colors"
                >
                  Xóa hết
                </button>
                <button 
                  onClick={analyzeAll}
                  disabled={isProcessingAll || files.every(f => f.status === 'done')}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#004a99] text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 disabled:opacity-50 disabled:grayscale"
                >
                  {isProcessingAll ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} />}
                  Phân tích nhanh
                </button>
                
                <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200">
                  <button 
                    onClick={() => downloadAllZip('pdf')}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-100 border border-slate-200 transition-colors shadow-sm"
                  >
                    <FileType size={16} className="text-[#004a99]" />
                    Tải .ZIP (PDF)
                  </button>
                  <button 
                    onClick={() => downloadAllZip('jpg')}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-100 border border-slate-200 transition-colors shadow-sm"
                  >
                    <Download size={16} className="text-[#f37021]" />
                    Tải .ZIP (JPG)
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* File List */}
          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {files.map((fileItem) => (
                <motion.div
                  key={fileItem.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white border border-slate-100 p-4 rounded-3xl shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4 overflow-hidden relative"
                >
                   {fileItem.status === 'analyzing' && (
                    <motion.div 
                      key="loader-bar"
                      initial={{ left: '-100%' }}
                      animate={{ left: '100%' }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                      className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#004a99] to-transparent z-10"
                    />
                  )}
                  
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border",
                        fileItem.status === 'done' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-50 text-slate-400 border-slate-100"
                      )}>
                        {fileItem.status === 'done' ? <Check size={24} /> : <FileText size={24} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-slate-900 truncate flex items-center gap-2">
                          {fileItem.originalName}
                          <span className="text-[10px] font-mono text-slate-300">#{(fileItem.file.size / 1024).toFixed(0)}kb</span>
                        </h4>
                        
                        <div className="mt-1">
                          {fileItem.status === 'done' && (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                              <span className="text-[10px] text-slate-400 font-bold uppercase shrink-0">Tên mới:</span>
                              <div className="flex items-center gap-1 flex-1">
                                <input 
                                  type="text"
                                  value={fileItem.suggestedName}
                                  onChange={(e) => setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, suggestedName: e.target.value } : f))}
                                  className="bg-slate-50 border-none rounded-xl px-4 py-2 focus:ring-2 focus:ring-[#004a99] outline-none w-full font-bold text-sm text-[#004a99]"
                                />
                                <span className="text-slate-300 font-bold text-xs shrink-0">.{fileItem.originalName.split('.').pop()}</span>
                              </div>
                            </div>
                          )}
                          {fileItem.status === 'error' && (
                            <span className="text-red-500 text-xs font-bold flex items-center gap-1">
                              <Info size={12} /> {fileItem.error}
                            </span>
                          )}
                        </div>

                        {fileItem.analysis && (
                          <div className="mt-3 p-4 bg-slate-50/80 rounded-2xl border border-slate-100 relative group/summary">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nội dung đã đọc</span>
                              <button 
                                onClick={() => {
                                  const cleanName = fileItem.analysis?.suggestedName || fileItem.originalName.split('.')[0];
                                  setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, suggestedName: cleanName } : f));
                                }}
                                className="opacity-0 group-hover/summary:opacity-100 transition-opacity text-[10px] font-bold text-[#004a99] hover:underline flex items-center gap-1"
                              >
                                Đặt lại tên ban đầu <ChevronRight size={10} />
                              </button>
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                              {fileItem.analysis.summary}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {fileItem.status === 'idle' && (
                        <button 
                          onClick={() => analyzeFile(fileItem.id)}
                          className="px-4 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors"
                        >
                          Đọc
                        </button>
                      )}
                      {fileItem.status === 'analyzing' && (
                        <div className="flex items-center gap-2 text-[#004a99] text-[10px] md:text-xs font-bold px-3">
                          <Loader2 className="animate-spin" size={14} />
                          Đang đọc...
                        </div>
                      )}
                      {fileItem.status === 'done' && (
                        <button 
                          onClick={() => downloadFile(fileItem)}
                          className="p-3 text-slate-400 hover:text-[#004a99] hover:bg-white rounded-2xl transition-all hover:shadow-sm"
                          title="Tải về ngay"
                        >
                          <Download size={20} />
                        </button>
                      )}
                      <button 
                        onClick={() => removeFile(fileItem.id)}
                        className="p-3 text-slate-300 hover:text-red-500 hover:bg-white rounded-2xl transition-all"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {files.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-32 text-center"
            >
              <div className="w-24 h-24 bg-white shadow-inner rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-slate-200">
                <FileText size={48} />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-1">Bắt đầu ngay</h3>
              <p className="text-slate-400 max-w-xs mx-auto text-sm">Tải lên các Lệnh Xuất Kho để AI giúp bạn tiết kiệm thời gian đặt tên tệp.</p>
            </motion.div>
          )}
        </main>

        <footer className="mt-24 pt-12 border-t border-slate-200 text-center space-y-4">
          <div className="flex items-center justify-center gap-6 grayscale opacity-30">
            <div className="font-bold text-xl italic text-slate-400">PETROLIMEX</div>
            <div className="h-4 w-[1px] bg-slate-300"></div>
            <div className="font-bold text-sm tracking-widest text-slate-400 uppercase">Archive System</div>
          </div>
          <p className="text-slate-300 text-[10px] font-bold uppercase tracking-[0.2em]">
            © 2026 Developed by @NhonNguyen29 for Petrolimex Operations
          </p>
        </footer>
      </div>
    </div>
  );
}
