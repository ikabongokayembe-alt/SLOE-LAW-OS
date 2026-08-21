console.log('Testing Google Gemini API endpoints...');

const promptBody = {
  contents: [{ role: 'user', parts: [{ text: 'Hello, respond with JSON: {"status": "ok"}' }] }],
  generationConfig: { responseMimeType: 'application/json' },
};

const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];

for (const model of models) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=TEST_DUMMY_KEY`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(promptBody),
  });
  const text = await res.text();
  console.log(`\nModel: [${model}] -> Status: ${res.status} ${res.statusText}`);
  console.log(`Response text preview: ${text.slice(0, 300)}`);
}
