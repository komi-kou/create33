'use client';

import React, { useState, useRef, ChangeEvent } from 'react';
import { Upload, Download, Sparkles, Image as ImageIcon, Loader2, AlertCircle } from 'lucide-react';

interface Variation {
  data: string;
  mimeType: string;
  index: number;
  type?: 'text-only' | 'edit' | 'generate' | 'combined';
}

const ImageEditor = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [variations, setVariations] = useState<Variation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [imageCount, setImageCount] = useState<1 | 2 | 3>(3);
  const [mode, setMode] = useState<'edit' | 'generate' | 'combined'>('edit');
  const [textPrompt, setTextPrompt] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const samplePrompts = [
    '背景をぼかして被写体を強調',
    '明るさを上げて暖かい雰囲気に',
    'プロフェッショナルな白黒写真に変換',
    '夕暮れの雰囲気を追加',
    '背景を削除して透明に',
    'ヴィンテージスタイルに加工'
  ];

  const combinedSamplePrompts = [
    '背景を夏っぽいビーチに変更',
    '背景を冬の雪景色に変更',
    '背景を都市の夜景に変更',
    '背景を森の中に変更',
    '背景をシンプルな白背景に変更'
  ];

  const textSamplePrompts = [
    '美しい夕日と海の風景',
    '可愛い猫の写真',
    'モダンなオフィスビル',
    '桜が咲く公園の風景',
    '美味しそうな料理の写真',
    'アートな抽象画'
  ];

  const resetStateForMode = (newMode: string) => {
    setVariations([]);
    setError(null);
    if (newMode === 'generate') {
      setSelectedImage(null);
      setTextPrompt('');
    } else {
      setTextPrompt('');
    }
  };

  const handleModeChange = (newMode: 'edit' | 'generate' | 'combined') => {
    setMode(newMode);
    resetStateForMode(newMode);
  };

  const processApiResponse = (data: any, mode: string): Variation[] => {
    const processedVariations: Variation[] = [];
    
    if (data.response?.choices?.[0]?.message?.images) {
      data.response.choices[0].message.images.forEach((img: any, index: number) => {
        if (img.image_url?.url) {
          const base64Data = img.image_url.url.replace(/^data:image\/[^;]+;base64,/, '');
          processedVariations.push({
            data: base64Data,
            mimeType: 'image/png',
            index: index + 1
          });
        }
      });
    } else if (data.response?.candidates?.[0]?.content?.parts) {
      data.response.candidates[0].content.parts.forEach((part: any, index: number) => {
        if (part.inlineData?.data) {
          processedVariations.push({
            data: part.inlineData.data,
            mimeType: part.inlineData.mimeType || 'image/png',
            index: index + 1
          });
        }
      });
    }

    return processedVariations;
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('画像ファイルを選択してください');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedImage(reader.result as string);
      setError(null);
      setVariations([]);
    };
    reader.readAsDataURL(file);
  };

  const generateVariations = async () => {
    // モード別の入力検証
    if (mode === 'edit' || mode === 'combined') {
      if (!selectedImage || !prompt) {
        setError('画像と編集指示を入力してください');
        return;
      }
    } else {
      if (!textPrompt.trim()) {
        setError('画像生成の説明を入力してください');
        return;
      }
    }

    setIsLoading(true);
    setError(null);
    setVariations([]);

    try {
      if (mode === 'combined') {
        // 統合モード: 文字削除商品画像を3枚生成
        const base64Image = selectedImage!.split(',')[1];
        
        // 統合モード専用の選択的文字削除プロンプト
        const baseTextRemovalPrompt = 'この商品画像からオーバーレイされたテキスト（画像上に重ねて表示された文字）のみを削除してください。商品のラベル、パッケージ、ボトルに印刷されているブランド名、商品名、ロゴ、成分表示、使用方法、容量表示、製造元情報など、商品に直接印刷・記載されている全ての文字は保持してください。商品の形状、色、質感、ラベルデザインは一切変更せず、オーバーレイテキストが表示されていた部分のみを自然に補完してください。各画像は独立した1つのシーンのみを含み、複数のシーンを1つの画像にまとめないでください。';
        
        // ユーザーが追加指示を入力した場合は背景変更を追加
        const userPrompt = prompt.trim();
        const finalPrompt = userPrompt 
          ? `${baseTextRemovalPrompt} 背景は「${userPrompt}」に変更してください。`
          : `${baseTextRemovalPrompt} 背景は商品に合った自然な背景に変更してください。`;
        
        const textRemovalRequest = {
          mode: 'edit',
          image: base64Image,
          prompt: finalPrompt,
          imageCount: 3
        };
        
        const response = await fetch('/api/edit-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(textRemovalRequest)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || '文字削除エラー');
        }
        
        // 結果を処理
        const variations = processApiResponse(data, 'combined');
        
        // タイプを設定
        variations.forEach((v, i) => {
          v.index = i + 1;
          v.type = 'combined';
        });
        
        setVariations(variations);
        return;
      }
      
      // 通常モードの処理
      const requestBody: any = {
        mode: mode,
        imageCount: imageCount
      };

      if (mode === 'edit') {
        const base64Image = selectedImage!.split(',')[1];
        requestBody.image = base64Image;
        requestBody.prompt = prompt;
      } else {
        requestBody.textPrompt = textPrompt;
      }
      
      const response = await fetch('/api/edit-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      console.log('Frontend Response:', data);

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('無料枠上限に達しました(50回/日)。明日再試行するか、$10購入で1000回/日に拡張できます。');
        } else if (response.status === 401) {
          throw new Error('APIキー設定エラー。.env.localファイルを確認してサーバーを再起動してください。');
        }
        throw new Error(data.error || `エラー: ${response.status}`);
      }

      // レスポンス処理
      const processedVariations = processApiResponse(data, mode);

      if (processedVariations.length === 0) {
        console.log('Debug Response Structure:', JSON.stringify(data.response, null, 2));
        throw new Error('画像生成に失敗しました。レスポンス構造を確認してください。');
      }

      setVariations(processedVariations);
      
    } catch (err) {
      console.error('Generation Error:', err);
      setError(err instanceof Error ? err.message : '予期しないエラー');
    } finally {
      setIsLoading(false);
    }
  };

  const downloadImage = (variation: Variation) => {
    console.log('Downloading variation:', variation.index, 'Data length:', variation.data.length);
    
    const link = document.createElement('a');
    link.href = `data:${variation.mimeType};base64,${variation.data}`;
    
    // ファイル名を種類に応じて変更
    let filename = '';
    if (variation.type === 'combined') {
      filename = `overlay-removed-product-${variation.index}.png`;
    } else if (variation.type === 'text-only') {
      filename = `text-only-${variation.index}.png`;
    } else if (variation.type === 'edit') {
      filename = `edited-image-${variation.index}.png`;
    } else {
      filename = `generated-image-${variation.index}.png`;
    }
    
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log('Download completed');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 p-4">
      <div className="max-w-7xl mx-auto">
        <header className="text-center py-8">
          <h1 className="text-4xl font-bold text-purple-700 mb-4">
            AI画像ツール
          </h1>
          
          {/* モード切り替えボタン */}
          <div className="flex justify-center mb-6">
            <div className="bg-white rounded-lg shadow-md p-1">
              <button
                onClick={() => handleModeChange('edit')}
                className={`px-6 py-2 rounded-md font-medium transition-all ${
                  mode === 'edit'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-gray-600 hover:text-purple-600'
                }`}
              >
                画像編集
              </button>
              <button
                onClick={() => handleModeChange('generate')}
                className={`px-6 py-2 rounded-md font-medium transition-all ${
                  mode === 'generate'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-gray-600 hover:text-purple-600'
                }`}
              >
                文字から画像生成
              </button>
              <button
                onClick={() => handleModeChange('combined')}
                className={`px-6 py-2 rounded-md font-medium transition-all ${
                  mode === 'combined'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-gray-600 hover:text-purple-600'
                }`}
              >
                統合モード
              </button>
            </div>
          </div>
          
          {/* 統合モードの説明 */}
          {mode === 'combined' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 max-w-2xl mx-auto">
              <p className="text-blue-800 font-medium">統合モード - 文字削除</p>
              <p className="text-blue-600 text-sm">商品画像からオーバーレイテキストのみを自動削除し、商品に記載されている全ての文字（ラベル、成分表示等）は保持して独立した3枚の画像を生成します</p>
            </div>
          )}
        </header>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            {(mode === 'edit' || mode === 'combined') && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-purple-600" />
                  画像をアップロード
                </h2>
              
              <div
                className={`border-2 border-dashed rounded-lg p-8 transition-colors ${
                  dragActive ? 'border-purple-500 bg-purple-50' : 'border-gray-300'
                } hover:border-purple-400 hover:bg-gray-50`}
                style={{ minHeight: '400px' }}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileInput}
                  className="hidden"
                />
                
                {selectedImage ? (
                  <div className="relative h-full flex items-center justify-center">
                    <img 
                      src={selectedImage} 
                      alt="Selected" 
                      className="max-w-full max-h-full rounded-lg object-contain bg-white"
                      style={{ backgroundColor: 'white' }}
                      onError={(e) => {
                        console.error('Image display error:', e);
                        setError('画像の表示に失敗しました');
                      }}
                      onLoad={() => console.log('Image loaded successfully')}
                    />
                    <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors rounded-lg cursor-pointer flex items-center justify-center">
                      <p className="text-white opacity-0 hover:opacity-100 transition-opacity">
                        クリックして変更
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <ImageIcon className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-600 mb-2">
                      画像をドラッグ&ドロップ
                    </p>
                    <p className="text-sm text-gray-500">
                      またはクリックして選択
                    </p>
                  </div>
                )}
              </div>
            </div>
            )}

            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                {mode === 'edit' ? '編集指示' : mode === 'combined' ? '文字削除指示（オプション）' : '画像生成の説明'}
              </h2>
              
              {mode === 'edit' || mode === 'combined' ? (
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={mode === 'combined' ? "背景をどのように変更しますか？（例：夏っぽいビーチに変更）- 商品の文字は自動で保持されます" : "どのように画像を編集しますか？"}
                  className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all text-gray-800 placeholder-gray-500"
                  rows={4}
                />
              ) : (
                <textarea
                  value={textPrompt}
                  onChange={(e) => setTextPrompt(e.target.value)}
                  placeholder="生成したい画像の詳細な説明を入力してください"
                  className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all text-gray-800 placeholder-gray-500"
                  rows={4}
                />
              )}

              <div className="mt-4">
                <p className="text-sm text-gray-600 mb-2">{mode === 'combined' ? 'サンプル指示（文字削除）:' : 'サンプル指示:'}</p>
                <div className="flex flex-wrap gap-2">
                  {(mode === 'edit' || mode === 'combined' ? 
                    (mode === 'combined' ? combinedSamplePrompts : samplePrompts) : 
                    textSamplePrompts).map((sample, index) => (
                    <button
                      key={index}
                      onClick={() => (mode === 'edit' || mode === 'combined') ? setPrompt(sample) : setTextPrompt(sample)}
                      className="px-3 py-1 text-sm bg-gray-100 hover:bg-purple-100 text-gray-700 hover:text-purple-700 rounded-full transition-colors"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </div>

              {/* 生成枚数選択（統合モード以外） */}
              {mode !== 'combined' && (
                <div className="mt-4">
                  <p className="text-sm text-gray-600 mb-2">生成枚数:</p>
                  <select 
                    value={imageCount} 
                    onChange={(e) => setImageCount(Number(e.target.value) as 1 | 2 | 3)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value={1}>1枚</option>
                    <option value={2}>2枚</option>
                    <option value={3}>3枚</option>
                  </select>
                </div>
              )}

              <button
                onClick={generateVariations}
                disabled={
                  isLoading || 
                  ((mode === 'edit' || mode === 'combined') && (!selectedImage || !prompt)) ||
                  (mode === 'generate' && !textPrompt.trim())
                }
                className={`w-full mt-4 py-3 px-4 rounded-lg font-semibold transition-all transform hover:scale-105 ${
                  isLoading || 
                  ((mode === 'edit' || mode === 'combined') && (!selectedImage || !prompt)) ||
                  (mode === 'generate' && !textPrompt.trim())
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700'
                }`}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {mode === 'combined' ? '統合生成中...' : '生成中...'}
                  </span>
                ) : (
                  mode === 'combined' 
                    ? 'オーバーレイ削除商品画像を3枚生成'
                    : mode === 'edit' 
                      ? `${imageCount}つのバリエーションを生成`
                      : `${imageCount}枚の画像を生成`
                )}
              </button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                <div>
                  <p className="text-red-800 font-medium">エラー</p>
                  <p className="text-red-600 text-sm mt-1">{error}</p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">生成結果</h2>
              
              {variations.length > 0 ? (
                <div className="space-y-6">
                  {mode === 'combined' ? (
                    // 統合モード: 文字削除商品画像表示
                    <div>
                      <h3 className="text-lg font-semibold mb-3 text-green-700">オーバーレイテキスト削除商品画像</h3>
                      <div className="grid gap-4">
                        {variations.map((variation) => (
                          <div key={variation.index} className="relative group">
                            <img
                              src={`data:${variation.mimeType};base64,${variation.data}`}
                              alt={`Text Removed ${variation.index}`}
                              className="w-full h-auto rounded-lg bg-white border"
                              style={{ 
                                backgroundColor: 'white',
                                minHeight: '200px'
                              }}
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-lg" />
                            <button
                              onClick={() => downloadImage(variation)}
                              className="absolute top-4 right-4 p-2 bg-white rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity transform hover:scale-110"
                            >
                              <Download className="w-5 h-5 text-gray-700" />
                            </button>
                            <span className="absolute top-4 left-4 px-3 py-1 bg-green-500 text-white rounded-full shadow-lg text-sm font-semibold">
                              オーバーレイ削除 {variation.index}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    // 通常モード: 従来通りの表示
                    <div className="grid gap-4">
                      {variations.map((variation) => (
                        <div key={variation.index} className="relative group">
                          <img
                            src={`data:${variation.mimeType};base64,${variation.data}`}
                            alt={`Variation ${variation.index}`}
                            className="w-full h-auto rounded-lg bg-white border"
                            style={{ 
                              backgroundColor: 'white',
                              minHeight: '200px'
                            }}
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-lg" />
                          <button
                            onClick={() => downloadImage(variation)}
                            className="absolute top-4 right-4 p-2 bg-white rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity transform hover:scale-110"
                          >
                            <Download className="w-5 h-5 text-gray-700" />
                          </button>
                          <span className="absolute top-4 left-4 px-3 py-1 bg-white rounded-full shadow-lg text-sm font-semibold text-gray-700">
                            バリエーション {variation.index}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <ImageIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-500">
                    画像をアップロードして編集指示を入力してください
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageEditor;