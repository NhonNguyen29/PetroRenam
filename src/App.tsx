import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import JSZip from 'jszip';
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
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { analyzeFileContent, AnalysisResult } from './services/gemini';

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
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const [tokenUsage, setTokenUsage] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [userApiKey, setUserApiKey] = useState(() => localStorage.getItem('GEMINI_API_KEY') || '');

  const hasApiKey = !!process.env.GEMINI_API_KEY || !!userApiKey;

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
      
      // Simulate token usage tracking (approximate)
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
    for (const file of idleFiles) {
      await analyzeFile(file.id);
    }
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

  const downloadAll = async () => {
    const zip = new JSZip();
    const readyFiles = files.filter(f => f.status === 'done' || f.status === 'idle');
    
    if (readyFiles.length === 0) return;

    readyFiles.forEach(fileItem => {
      const extension = fileItem.originalName.split('.').pop();
      const newName = `${fileItem.suggestedName || fileItem.originalName.split('.')[0]}.${extension}`;
      zip.file(newName, fileItem.file);
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `renamed-files-${new Date().getTime()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
              <p className="text-[10px] text-slate-500 font-medium tracking-widest uppercase">Smart Bulk Renamer</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                <Zap size={12} className="text-[#f37021]" />
                <span>AI Usage: {tokenUsage.toLocaleString()} tokens</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-bold uppercase">
                <ShieldCheck size={10} />
                {hasApiKey ? 'API Connected' : 'API Missing'}
              </div>
            </div>
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
              <div className="bg-petro-blue p-6 text-white">
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
                <p className="text-blue-100 text-sm">Cấu hình kết nối AI Gemini để xử lý tài liệu.</p>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center",
                        hasApiKey ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                      )}>
                        <ShieldCheck size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">Trạng thái API</p>
                        <p className="text-xs text-slate-500">{hasApiKey ? 'Đã kết nối thành công' : 'Chưa cấu hình API Key'}</p>
                      </div>
                    </div>
                    {hasApiKey && <Check className="text-emerald-500" size={20} />}
                  </div>

                  <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 space-y-3">
                    <h4 className="text-sm font-bold text-petro-blue flex items-center gap-2">
                      <Zap size={16} /> Cấu hình API Key cá nhân
                    </h4>
                    <p className="text-[10px] text-slate-500">Nếu bạn sử dụng phiên bản công khai, hãy nhập API Key Gemini của riêng bạn tại đây.</p>
                    <div className="relative">
                      <input 
                        type="password"
                        value={userApiKey}
                        onChange={(e) => saveApiKey(e.target.value)}
                        placeholder="Dán API Key của bạn vào đây..."
                        className="w-full bg-white border border-blue-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-petro-blue outline-none pr-10"
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
                    <a 
                      href="https://aistudio.google.com/app/apikey" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[10px] text-petro-blue hover:underline font-bold flex items-center gap-1"
                    >
                      Lấy API Key miễn phí tại Google AI Studio <ChevronRight size={10} />
                    </a>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                    <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                      <Info size={16} /> Hướng dẫn
                    </h4>
                    <ol className="text-[11px] text-slate-500 space-y-1.5 list-decimal ml-4">
                      <li>Truy cập <b>Google AI Studio</b> theo link phía trên.</li>
                      <li>Tạo một <b>API Key</b> mới (hoàn toàn miễn phí).</li>
                      <li>Dán mã đó vào ô nhập liệu ở trên.</li>
                      <li>Hệ thống sẽ tự động lưu và sử dụng key này để xử lý tệp.</li>
                    </ol>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Thống kê sử dụng</p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Tổng Token đã dùng:</span>
                      <span className="font-mono font-bold text-petro-blue">{tokenUsage.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => setShowSettings(false)}
                  className="w-full btn-primary py-3"
                >
                  Đóng thiết lập
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="max-w-5xl mx-auto p-4 md:p-8">
        <header className="mb-10 text-center md:text-left">
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">
            Hệ Thống Đổi Tên <span className="text-[#f37021]">Lệnh Xuất Kho</span>
          </h2>
          <p className="text-slate-500 max-w-2xl">
            Tự động trích xuất thông tin ngày, biển số, tên người vận tải và mã phiếu từ tài liệu Petrolimex để đặt tên tệp chuẩn xác.
          </p>
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
                  {isDragActive ? "Thả tệp vào đây" : "Kéo thả Lệnh Xuất Kho vào đây"}
                </p>
                <p className="text-slate-400 mt-1">
                  Hỗ trợ PDF, PNG, JPG (Tối đa 20MB/file)
                </p>
              </div>
              <button className="btn-secondary mt-2">
                Chọn Tệp
              </button>
            </div>
          </section>

          {/* Action Bar */}
          {files.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm"
            >
              <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
                <Info size={16} className="text-[#004a99]" />
                <span>Đã chọn {files.length} tệp</span>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setFiles([])}
                  className="btn-secondary text-red-600 border-red-100 hover:bg-red-50"
                >
                  Xóa tất cả
                </button>
                <button 
                  onClick={analyzeAll}
                  disabled={isProcessingAll || files.every(f => f.status === 'done')}
                  className="btn-primary flex items-center gap-2"
                >
                  {isProcessingAll ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
                  Phân tích tất cả
                </button>
                <button 
                  onClick={downloadAll}
                  className="btn-secondary flex items-center gap-2 border-[#f37021] text-[#f37021] hover:bg-orange-50"
                >
                  <Download size={18} />
                  Tải về .ZIP
                </button>
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
                  className="glass-card p-4 flex flex-col gap-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                        fileItem.status === 'done' ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
                      )}>
                        {fileItem.status === 'done' ? <Check size={24} /> : <FileText size={24} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-slate-900 truncate">
                          {fileItem.originalName}
                        </h4>
                        
                        <div className="mt-1 flex flex-col gap-2">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                            <span className="text-slate-400 font-mono">
                              {(fileItem.file.size / 1024).toFixed(1)} KB
                            </span>
                            {fileItem.status === 'done' && (
                              <div className="flex items-center gap-1 text-slate-900 font-bold">
                                <ChevronRight size={14} className="text-slate-300" />
                                <input 
                                  type="text"
                                  value={fileItem.suggestedName}
                                  onChange={(e) => setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, suggestedName: e.target.value } : f))}
                                  className="bg-slate-100 border-none rounded-lg px-3 py-1 focus:ring-2 focus:ring-[#004a99] outline-none w-full max-w-[400px] text-sm"
                                  placeholder="Tên tệp mới"
                                />
                                <span className="text-slate-400">.{fileItem.originalName.split('.').pop()}</span>
                              </div>
                            )}
                            {fileItem.status === 'error' && (
                              <span className="text-red-500 text-xs font-bold bg-red-50 px-2 py-1 rounded">
                                {fileItem.error}
                              </span>
                            )}
                          </div>

                          {fileItem.analysis && (
                            <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nội dung trích xuất</span>
                                <button 
                                  onClick={() => {
                                    const cleanName = fileItem.analysis?.summary
                                      .toLowerCase()
                                      .replace(/[^a-z0-9]/g, '-')
                                      .replace(/-+/g, '-')
                                      .substring(0, 50);
                                    setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, suggestedName: cleanName || f.suggestedName } : f));
                                  }}
                                  className="text-[10px] font-bold uppercase tracking-wider text-[#004a99] hover:text-blue-800 flex items-center gap-1"
                                >
                                  <RefreshCw size={10} /> Sử dụng làm tên
                                </button>
                              </div>
                              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                                {fileItem.analysis.summary}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {fileItem.status === 'idle' && (
                        <button 
                          onClick={() => analyzeFile(fileItem.id)}
                          className="btn-secondary text-xs py-1.5 border-[#004a99] text-[#004a99]"
                        >
                          Phân tích
                        </button>
                      )}
                      {fileItem.status === 'analyzing' && (
                        <div className="flex items-center gap-2 text-slate-400 text-xs font-bold px-3">
                          <Loader2 className="animate-spin" size={14} />
                          Đang xử lý...
                        </div>
                      )}
                      {fileItem.status === 'done' && (
                        <button 
                          onClick={() => downloadFile(fileItem)}
                          className="p-2 text-slate-400 hover:text-[#004a99] hover:bg-blue-50 rounded-lg transition-colors"
                          title="Tải về với tên mới"
                        >
                          <Download size={20} />
                        </button>
                      )}
                      <button 
                        onClick={() => removeFile(fileItem.id)}
                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
              className="py-24 text-center"
            >
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                <FileText size={40} />
              </div>
              <p className="text-slate-400 font-medium">Chưa có tệp nào được tải lên. Hãy bắt đầu bằng cách kéo thả tệp vào vùng phía trên.</p>
            </motion.div>
          )}
        </main>

        <footer className="mt-20 pt-8 border-t border-slate-200 text-center text-slate-400 text-xs font-medium">
          <p>© 2026 PETROLIMEX • Hệ Thống Quản Lý Tài Liệu Thông Minh • Powered by @NhonNguyen29</p>
        </footer>
      </div>
    </div>
  );
}
