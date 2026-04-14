import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  FileVideo, 
  FileImage, 
  FileAudio, 
  X, 
  Download, 
  Loader2, 
  Settings2,
  CheckCircle2,
  AlertCircle,
  Globe
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getFFmpeg } from '@/src/lib/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import imageCompression from 'browser-image-compression';
import { toast } from 'sonner';

type FileType = 'video' | 'image' | 'audio';
type CompressionLevel = 'low' | 'medium' | 'high';

const FORMATS = {
  video: ['mp4', 'webm', 'avi'],
  audio: ['mp3', 'wav', 'ogg'],
  image: ['jpeg', 'png', 'webp']
};

const TRANSLATIONS = {
  en: {
    title: "Free Offline Compressor",
    subtitle: "No backend. 100% local processing. Your data stays on your device.",
    uploadTitle: "Click or drag files to upload",
    uploadSubtitle: "Supports Video, Images, and Audio",
    globalLevel: "Global Level",
    advancedMode: "Advanced Mode",
    compressAll: "Compress All",
    processing: "Processing...",
    small: "Small",
    medium: "Medium",
    high: "High",
    level: "Level",
    format: "Format",
    photos: "Photos",
    videos: "Videos",
    audio: "Audio",
    footer: "© 2026 Free Offline Compressor. All processing happens in your browser.",
    compressedTo: "Compressed to",
    compressionFailed: "Compression failed",
    langToggle: "中文"
  },
  zh: {
    title: "免費離線壓縮",
    subtitle: "無後端處理，100% 本地端壓縮，絕對保障您的資料安全。",
    uploadTitle: "點擊或拖曳檔案至此上傳",
    uploadSubtitle: "支援影片、相片與音樂格式",
    globalLevel: "全域壓縮等級",
    advancedMode: "進階模式",
    compressAll: "全部壓縮",
    processing: "處理中...",
    small: "高壓縮 (小檔案)",
    medium: "中等",
    high: "低壓縮 (高畫質)",
    level: "壓縮等級",
    format: "輸出格式",
    photos: "相片",
    videos: "影片",
    audio: "音樂",
    footer: "© 2026 免費離線壓縮。所有處理皆在您的瀏覽器中完成，保障隱私。",
    compressedTo: "已壓縮至",
    compressionFailed: "壓縮失敗",
    langToggle: "English"
  }
};

interface FileItem {
  id: string;
  file: File;
  type: FileType;
  status: 'idle' | 'processing' | 'completed' | 'error';
  progress: number;
  compressedBlob?: Blob;
  compressedSize?: number;
  error?: string;
  customLevel?: CompressionLevel;
  customFormat?: string;
}

const Compressor: React.FC = () => {
  const [lang, setLang] = useState<'en' | 'zh'>(() => {
    if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().includes('zh')) {
      return 'zh';
    }
    return 'en';
  });
  const t = TRANSLATIONS[lang];

  const [files, setFiles] = useState<FileItem[]>([]);
  const [compressionLevel, setCompressionLevel] = useState<CompressionLevel>('medium');
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);
  const [isProcessingAll, setIsProcessingAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getFileType = (file: File): FileType => {
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('audio/')) return 'audio';
    return 'image'; // Default fallback
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files) as File[];
      const newFiles: FileItem[] = selectedFiles.map(file => {
        const type = getFileType(file);
        return {
          id: Math.random().toString(36).substr(2, 9),
          file,
          type,
          status: 'idle',
          progress: 0,
          customLevel: compressionLevel,
          customFormat: FORMATS[type][0],
        };
      });
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const updateFileSetting = (id: string, key: keyof FileItem, value: any) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, [key]: value } : f));
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const compressImage = async (file: File, level: CompressionLevel, format: string) => {
    const options = {
      maxSizeMB: level === 'high' ? 0.5 : level === 'medium' ? 1 : 2,
      maxWidthOrHeight: level === 'high' ? 1080 : level === 'medium' ? 1920 : 3840,
      useWebWorker: true,
      initialQuality: level === 'high' ? 0.6 : level === 'medium' ? 0.8 : 0.9,
      fileType: `image/${format}`
    };
    return await imageCompression(file, options);
  };

  const compressMedia = async (fileItem: FileItem) => {
    const { file, type, id } = fileItem;
    const level = fileItem.customLevel || compressionLevel;
    const format = fileItem.customFormat || FORMATS[type][0];
    
    setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'processing', progress: 0 } : f));

    try {
      if (type === 'image') {
        const compressed = await compressImage(file, level, format);
        setFiles(prev => prev.map(f => f.id === id ? { 
          ...f, 
          status: 'completed', 
          progress: 100, 
          compressedBlob: compressed,
          compressedSize: compressed.size
        } : f));
      } else {
        // Video or Audio using FFmpeg
        const ffmpeg = await getFFmpeg();
        const inputName = `input_${id}_${file.name}`;
        const outputName = `output_${id}_${file.name.split('.')[0]}.${format}`;

        await ffmpeg.writeFile(inputName, await fetchFile(file));

        ffmpeg.on('progress', ({ progress }) => {
          setFiles(prev => prev.map(f => f.id === id ? { ...f, progress: Math.round(progress * 100) } : f));
        });

        // Compression settings based on level
        let args: string[] = [];
        if (type === 'video') {
          const crf = level === 'high' ? '28' : level === 'medium' ? '23' : '18';
          if (format === 'mp4') {
            args = ['-i', inputName, '-vcodec', 'libx264', '-crf', crf, '-preset', 'veryfast', '-acodec', 'aac', outputName];
          } else if (format === 'webm') {
            args = ['-i', inputName, '-vcodec', 'libvpx', '-crf', crf, '-b:v', '1M', '-acodec', 'libvorbis', outputName];
          } else if (format === 'avi') {
            const q = level === 'high' ? '10' : level === 'medium' ? '5' : '3';
            args = ['-i', inputName, '-vcodec', 'mpeg4', '-q:v', q, '-acodec', 'libmp3lame', outputName];
          }
        } else {
          const bitrate = level === 'high' ? '64k' : level === 'medium' ? '128k' : '192k';
          if (format === 'mp3') {
            args = ['-i', inputName, '-ab', bitrate, outputName];
          } else if (format === 'ogg') {
            args = ['-i', inputName, '-c:a', 'libvorbis', '-ab', bitrate, outputName];
          } else if (format === 'wav') {
            args = ['-i', inputName, outputName];
          }
        }

        await ffmpeg.exec(args);

        const data = await ffmpeg.readFile(outputName);
        const mimeType = type === 'video' ? `video/${format}` : `audio/${format === 'mp3' ? 'mpeg' : format}`;
        const compressedBlob = new Blob([data], { type: mimeType });

        setFiles(prev => prev.map(f => f.id === id ? { 
          ...f, 
          status: 'completed', 
          progress: 100, 
          compressedBlob,
          compressedSize: compressedBlob.size
        } : f));

        // Cleanup
        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);
      }
    } catch (error) {
      console.error('Compression error:', error);
      setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'error', error: t.compressionFailed } : f));
      toast.error(`${t.compressionFailed}: ${file.name}`);
    }
  };

  const processAll = async () => {
    setIsProcessingAll(true);
    const idleFiles = files.filter(f => f.status === 'idle');
    for (const fileItem of idleFiles) {
      await compressMedia(fileItem);
    }
    setIsProcessingAll(false);
  };

  const downloadFile = (fileItem: FileItem) => {
    if (!fileItem.compressedBlob) return;
    const url = URL.createObjectURL(fileItem.compressedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compressed_${fileItem.file.name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setLang(lang === 'en' ? 'zh' : 'en')} className="text-slate-500">
          <Globe className="w-4 h-4 mr-2" />
          {t.langToggle}
        </Button>
      </div>

      <header className="text-center space-y-2">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">{t.title}</h1>
        <p className="text-slate-500 font-medium">{t.subtitle}</p>
      </header>

      <Card className="border-dashed border-2 bg-slate-50/50">
        <CardContent className="p-10">
          <div 
            className="flex flex-col items-center justify-center space-y-4 cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="p-4 bg-white rounded-full shadow-sm">
              <Upload className="w-8 h-8 text-blue-600" />
            </div>
            <div className="text-center">
              <p className="text-lg font-medium">{t.uploadTitle}</p>
              <p className="text-sm text-slate-400">{t.uploadSubtitle}</p>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              multiple 
              accept="video/*,image/*,audio/*"
              onChange={handleFileSelect}
            />
          </div>
        </CardContent>
      </Card>

      {files.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border shadow-sm">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-4">
                <Settings2 className="w-5 h-5 text-slate-400" />
                <div className="space-y-1">
                  <Label className="text-xs uppercase tracking-wider text-slate-500 font-semibold">{t.globalLevel}</Label>
                  <Tabs 
                    value={compressionLevel} 
                    onValueChange={(v) => {
                      setCompressionLevel(v as CompressionLevel);
                      // Update all idle files to new global level if not in advanced mode
                      if (!isAdvancedMode) {
                        setFiles(prev => prev.map(f => f.status === 'idle' ? { ...f, customLevel: v as CompressionLevel } : f));
                      }
                    }}
                    className="w-[240px]"
                  >
                    <TabsList className="grid grid-cols-3">
                      <TabsTrigger value="low">{t.small}</TabsTrigger>
                      <TabsTrigger value="medium">{t.medium}</TabsTrigger>
                      <TabsTrigger value="high">{t.high}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>
              <div className="flex items-center space-x-2 border-l pl-6">
                <Switch 
                  id="advanced-mode" 
                  checked={isAdvancedMode} 
                  onCheckedChange={setIsAdvancedMode} 
                />
                <Label htmlFor="advanced-mode" className="text-sm font-medium cursor-pointer">
                  {t.advancedMode}
                </Label>
              </div>
            </div>
            <Button 
              onClick={processAll} 
              disabled={isProcessingAll || files.every(f => f.status === 'completed')}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isProcessingAll ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t.processing}
                </>
              ) : (
                t.compressAll
              )}
            </Button>
          </div>

          <div className="grid gap-4">
            <AnimatePresence mode="popLayout">
              {files.map((fileItem) => (
                <motion.div
                  key={fileItem.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                >
                  <Card className="overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-center space-x-4">
                        <div className="p-2 bg-slate-100 rounded-lg">
                          {fileItem.type === 'video' && <FileVideo className="w-6 h-6 text-purple-600" />}
                          {fileItem.type === 'image' && <FileImage className="w-6 h-6 text-emerald-600" />}
                          {fileItem.type === 'audio' && <FileAudio className="w-6 h-6 text-amber-600" />}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-medium truncate pr-4">{fileItem.file.name}</p>
                            <div className="flex items-center space-x-2">
                              <span className="text-xs text-slate-400">{formatSize(fileItem.file.size)}</span>
                              {fileItem.status === 'completed' && fileItem.compressedSize && (
                                <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-100">
                                  -{Math.round((1 - fileItem.compressedSize / fileItem.file.size) * 100)}%
                                </Badge>
                              )}
                            </div>
                          </div>
                          
                          {fileItem.status === 'processing' && (
                            <div className="space-y-1.5">
                              <Progress value={fileItem.progress} className="h-1.5" />
                              <p className="text-[10px] text-slate-400 text-right">{fileItem.progress}%</p>
                            </div>
                          )}

                          {fileItem.status === 'completed' && (
                            <div className="flex items-center text-xs text-emerald-600 font-medium">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              {t.compressedTo} {formatSize(fileItem.compressedSize!)}
                            </div>
                          )}

                          {fileItem.status === 'error' && (
                            <div className="flex items-center text-xs text-red-600 font-medium">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              {fileItem.error}
                            </div>
                          )}

                          {isAdvancedMode && fileItem.status === 'idle' && (
                            <div className="flex items-center space-x-3 mt-3">
                              <div className="space-y-1">
                                <Label className="text-[10px] uppercase text-slate-500">{t.level}</Label>
                                <Select 
                                  value={fileItem.customLevel || compressionLevel} 
                                  onValueChange={(v) => updateFileSetting(fileItem.id, 'customLevel', v)}
                                >
                                  <SelectTrigger className="h-7 text-xs w-[100px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="low" className="text-xs">{t.small}</SelectItem>
                                    <SelectItem value="medium" className="text-xs">{t.medium}</SelectItem>
                                    <SelectItem value="high" className="text-xs">{t.high}</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] uppercase text-slate-500">{t.format}</Label>
                                <Select 
                                  value={fileItem.customFormat || FORMATS[fileItem.type][0]} 
                                  onValueChange={(v) => updateFileSetting(fileItem.id, 'customFormat', v)}
                                >
                                  <SelectTrigger className="h-7 text-xs w-[90px] uppercase">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {FORMATS[fileItem.type].map(fmt => (
                                      <SelectItem key={fmt} value={fmt} className="text-xs uppercase">{fmt}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center space-x-2">
                          {fileItem.status === 'completed' ? (
                            <Button size="icon" variant="ghost" onClick={() => downloadFile(fileItem)}>
                              <Download className="w-4 h-4 text-blue-600" />
                            </Button>
                          ) : fileItem.status === 'idle' ? (
                            <Button size="icon" variant="ghost" onClick={() => compressMedia(fileItem)}>
                              <Upload className="w-4 h-4 text-slate-400" />
                            </Button>
                          ) : null}
                          
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={() => removeFile(fileItem.id)}
                            disabled={fileItem.status === 'processing'}
                          >
                            <X className="w-4 h-4 text-slate-400" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {files.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8">
          {[
            { icon: FileImage, title: t.photos, desc: 'JPG, PNG, WebP, GIF', color: 'text-emerald-600' },
            { icon: FileVideo, title: t.videos, desc: 'MP4, MOV, AVI, WebM', color: 'text-purple-600' },
            { icon: FileAudio, title: t.audio, desc: 'MP3, WAV, OGG, M4A', color: 'text-amber-600' },
          ].map((item, i) => (
            <div key={i} className="text-center space-y-2 p-6 rounded-2xl bg-white border shadow-sm">
              <item.icon className={`w-8 h-8 mx-auto ${item.color}`} />
              <h3 className="font-semibold">{item.title}</h3>
              <p className="text-xs text-slate-400">{item.desc}</p>
            </div>
          ))}
        </div>
      )}

      <footer className="text-center text-xs text-slate-400 pt-12 pb-8 space-y-2">
        <p>{t.footer}</p>
        <p>
          {lang === 'zh' ? '由 ' : 'Created by '}
          <a 
            href="https://home.barian.moe" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-blue-500 hover:text-blue-600 hover:underline transition-colors font-medium"
          >
            幽影櫻
          </a>
          {lang === 'zh' ? ' 製作' : ''}
        </p>
      </footer>
    </div>
  );
};

export default Compressor;
