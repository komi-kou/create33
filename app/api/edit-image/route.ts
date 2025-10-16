import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    console.log('=== API Route Start ===');
    
    const { image, prompt, mode, textPrompt, imageCount } = await request.json();
    
    // モード別の入力検証
    if (mode === 'edit') {
      if (!image || !prompt) {
        return NextResponse.json({ 
          error: '画像と編集指示が必要です' 
        }, { status: 400 });
      }
    } else if (mode === 'generate') {
      if (!textPrompt) {
        return NextResponse.json({ 
          error: '画像生成の説明が必要です' 
        }, { status: 400 });
      }
    } else if (mode === 'text-only') {
      if (!image) {
        return NextResponse.json({ 
          error: '画像が必要です' 
        }, { status: 400 });
      }
    } else {
      return NextResponse.json({ 
        error: '無効なモードです' 
      }, { status: 400 });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      console.error('Environment Variables Missing');
      return NextResponse.json({ 
        error: 'OpenRouter APIキーが設定されていません',
        solution: '.env.localファイルにOPENROUTER_API_KEYを設定してサーバーを再起動してください'
      }, { status: 500 });
    }

    console.log('Calling OpenRouter API...');

    // モードに応じたAPIリクエストボディを構築
    let requestBody: any = {
      model: "google/gemini-2.5-flash-image-preview",
      modalities: ["image", "text"],
      temperature: 0.7
    };

    if (mode === 'edit') {
      // 画像編集モード
      // プロンプトに文字削除のキーワードが含まれている場合は特別処理
      const isTextRemoval = prompt.includes('文字') && prompt.includes('削除');
      
      if (isTextRemoval) {
        // 選択的文字削除専用のプロンプト
        requestBody.messages = [{
          role: 'user',
          content: [
            { 
              type: 'text', 
              text: `${prompt} 重要：オーバーレイされたテキスト（画像上に重ねて表示された文字）のみを削除し、商品のラベル、パッケージ、ボトルに印刷されているブランド名、商品名、ロゴ、成分表示、使用方法、容量表示、製造元情報など、商品に直接印刷・記載されている全ての文字は保持してください。商品の形状、色、質感、ラベルデザインは一切変更せず、オーバーレイテキストが表示されていた部分のみを自然に補完してください。各画像は独立した1つのシーンのみを含み、複数のシーンを1つの画像にまとめないでください。${imageCount || 3}つの異なるバリエーションで高品質な画像を生成してください。`
            },
            { 
              type: 'image_url', 
              image_url: { url: `data:image/jpeg;base64,${image}` }
            }
          ]
        }];
      } else {
        // 通常の画像編集
        requestBody.messages = [{
          role: 'user',
          content: [
            { 
              type: 'text', 
              text: `この画像を「${prompt}」という指示で編集してください。${imageCount || 3}つの異なるバリエーションで高品質な画像を生成してください。広告用途に適しており、指示を忠実に反映したものにしてください。`
            },
            { 
              type: 'image_url', 
              image_url: { url: `data:image/jpeg;base64,${image}` }
            }
          ]
        }];
      }
    } else if (mode === 'text-only') {
      // 文字抽出モード
      requestBody.messages = [{
        role: 'user',
        content: [
          { 
            type: 'text', 
            text: 'この画像から文字部分のみを抽出し、背景を完全に透明にしてください。文字の形状、フォント、色は一切変更せず、そのまま保持してください。透明な背景のPNG形式で生成してください。'
          },
          { 
            type: 'image_url', 
            image_url: { url: `data:image/jpeg;base64,${image}` }
          }
        ]
      }];
    } else {
      // 文字画像生成モード
      requestBody.messages = [{
        role: 'user',
        content: [
          { 
            type: 'text', 
            text: `「${textPrompt}」という内容の画像を${imageCount || 3}枚生成してください。高品質で創造的で魅力的な画像にしてください。各画像は異なるアプローチや視点で作成してください。`
          }
        ]
      }];
    }

    const apiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'Gemini Image Editor'
      },
      body: JSON.stringify(requestBody)
    });

    console.log('OpenRouter Status:', apiResponse.status);

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error('OpenRouter Error:', errorText);
      
      let userMessage = 'API呼び出しエラー';
      if (apiResponse.status === 401) {
        userMessage = 'APIキーが無効です。OpenRouter.aiで新しいキーを生成してください';
      } else if (apiResponse.status === 429) {
        userMessage = '無料枠上限(50回/日)に達しました。$10購入で1000回/日に拡張できます';
      } else if (apiResponse.status === 402) {
        userMessage = 'アカウントクレジット不足です';
      }
      
      return NextResponse.json({ 
        error: userMessage,
        status: apiResponse.status,
        details: errorText
      }, { status: apiResponse.status });
    }

    const responseData = await apiResponse.json();
    console.log('OpenRouter Success:', JSON.stringify(responseData, null, 2));
    
    return NextResponse.json({ 
      success: true, 
      response: responseData
    });

  } catch (error) {
    console.error('Route Error:', error);
    return NextResponse.json({ 
      error: 'サーバーエラー',
      details: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ 
    status: 'API動作中',
    model: 'google/gemini-2.5-flash-image-preview',
    hasApiKey: !!process.env.OPENROUTER_API_KEY
  });
}