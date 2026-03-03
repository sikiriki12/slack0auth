import { supabase } from '../../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { gender: requestedGender, regenerateImageOnly } = req.body || {};

  try {
    // Fetch existing names and avatar URLs from both tables
    const [employeesRes, setupsRes] = await Promise.all([
      supabase.from('employees').select('name, personality, avatar_url, gender'),
      supabase.from('agent_setups').select('name'),
    ]);

    const employees = employeesRes.data || [];
    const existingNames = [
      ...employees.map((e) => e.name),
      ...(setupsRes.data || []).map((s) => s.name),
    ];

    const existingPersonalities = employees
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

    // Pick 4 random employee avatars as style reference
    const withAvatars = employees.filter((e) => e.avatar_url);
    const shuffled = withAvatars.sort(() => Math.random() - 0.5);
    const referenceEmployees = shuffled.slice(0, 4);

    // Download reference images as base64
    const referenceImages = await Promise.all(
      referenceEmployees.map(async (emp) => {
        try {
          const imgRes = await fetch(emp.avatar_url);
          const buffer = await imgRes.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
          return { base64, mimeType: contentType };
        } catch {
          return null;
        }
      })
    );

    const validRefs = referenceImages.filter(Boolean);

    // Build multimodal parts: reference images + text prompt
    const imageParts = validRefs.map((ref) => ({
      inlineData: { mimeType: ref.mimeType, data: ref.base64 },
    }));

    const imagePrompt = `Here are ${validRefs.length} example profile photos of existing AI employees. Study their style carefully.

Generate a NEW profile photo for a ${gender} AI employee that matches this EXACT style:
- 3D cartoon / Pixar-style rendered character
- Head and shoulders portrait, looking at camera, friendly expression
- Solid colored background (pick a DIFFERENT color than the examples — be creative)
- Casual clothing (hoodie, jacket, sweater, etc.)
- Ethnically diverse — make this character look DIFFERENT from the examples
- Same high-quality 3D render style, same lighting approach
- Square aspect ratio, profile photo framing

IMPORTANT: Match the 3D cartoon style exactly. Do NOT generate a photorealistic image.`;

    const imageRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [...imageParts, { text: imagePrompt }] }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
        }),
      }
    );

    const imageData = await imageRes.json();
    const generatedPart = imageData.candidates?.[0]?.content?.parts?.find(
      (p) => p.inlineData
    );

    const image = generatedPart ? generatedPart.inlineData.data : null;

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
