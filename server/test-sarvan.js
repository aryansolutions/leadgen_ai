
import 'dotenv/config';

const apiKey = process.env.SARVAM_API_KEY;

if (!apiKey) {
    console.error('❌ SARVAM_API_KEY is missing from server/.env');
    process.exit(1);
}

console.log('Testing Sarvam API authentication...');

try {
    const response = await fetch(
        'https://api.sarvam.ai/v2/chat/completions',
        {
            method: 'POST',
            headers: {
                'api-subscription-key': apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'deepseekv4.1-flash-1017',
                messages: [
                    {
                        role: 'user',
                        content: 'Reply with exactly: LeadFlow API connected',
                    },
                ],
                reasoning_effort: 'none',
                max_tokens: 30,
            }),
            signal: AbortSignal.timeout(30000),
        },
    );

    const data = await response.json();

    if (!response.ok) {
        console.error('❌ API request failed');
        console.error('HTTP status:', response.status);
        console.error('Error:', data.error || data);
        process.exit(1);
    }

    console.log('✅ SARVAM AUTHENTICATION SUCCESSFUL');
    console.log('Model:', data.model);
    console.log('AI response:', data.choices?.[0]?.message?.content);
    console.log('Usage:', data.usage);

} catch (error) {
    console.error('❌ Connection failed:', error.message);
    process.exit(1);
}
