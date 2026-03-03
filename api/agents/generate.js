import { supabase } from '../../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { gender: requestedGender, regenerateImageOnly } = req.body || {};

  try {
    // Fetch existing names from both tables to avoid duplicates
    const [employeesRes, setupsRes] = await Promise.all([
      supabase.from('employees').select('name, personality'),
      supabase.from('agent_setups').select('name'),
    ]);

    const existingNames = [
      ...(employeesRes.data || []).map((e) => e.name),
      ...(setupsRes.data || []).map((s) => s.name),
    ];

    const existingPersonalities = (employeesRes.data || [])
      .map((e) => e.personality)
      .filter(Boolean);

    const gender = requestedGender || (Math.random() < 0.5 ? 'male' : 'female');

    let name = null;
    let personality = null;

    // Generate name + personality unless only regenerating image
    if (!regenerateImageOnly) {
      const namePrompt = `You are naming AI employee agents for a company called Saint.
Existing names (DO NOT reuse): ${existingNames.join(', ')}
Existing personality styles for reference: ${existingPersonalities.slice(0, 10).join(' | ')}

Generate a unique first name and personality for a ${gender} AI agent.
The personality must be an emoji followed by a short description (under 60 chars).
Examples: "🎨 Creative and strategic, always thinking three campaigns ahead" or "🔢 Precise and reliable, never misses a decimal point"

Respond in JSON only: {"name": "...", "personality": "..."}`;

      const nameRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: namePrompt }] }],
            generationConfig: { temperature: 1.2, responseMimeType: 'application/json' },
          }),
        }
      );

      const nameData = await nameRes.json();
      const text = nameData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Failed to generate name');

      const parsed = JSON.parse(text);
      name = parsed.name;
      personality = parsed.personality;
    }

    // Generate avatar image
    const imagePrompt = `Generate a professional headshot portrait photo of a ${gender} person in their late 20s or early 30s.
Clean studio lighting, neutral background, shoulders visible, looking at camera with a natural expression.
Professional corporate style, high quality, photorealistic.
The image should look like a real employee profile photo.`;

    const imageRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: imagePrompt }] }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
        }),
      }
    );

    const imageData = await imageRes.json();
    const imagePart = imageData.candidates?.[0]?.content?.parts?.find(
      (p) => p.inlineData
    );

    const image = imagePart ? imagePart.inlineData.data : null;

    return res.status(200).json({
      name,
      personality,
      gender,
      tier: 'junior',
      image, // base64
    });
  } catch (error) {
    console.error('Generate error:', error);
    return res.status(500).json({ error: error.message || 'Generation failed' });
  }
}
