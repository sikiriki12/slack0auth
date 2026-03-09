import { supabase } from '../../lib/supabase.js';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

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

    // Pick 4 random example images from local folder as style reference
    const examplesDir = join(process.cwd(), 'public', 'image_examples');
    const allFiles = (await readdir(examplesDir)).filter((f) => f.endsWith('.png'));
    const shuffled = allFiles.sort(() => Math.random() - 0.5);
    const selectedFiles = shuffled.slice(0, 4);

    const referenceImages = await Promise.all(
      selectedFiles.map(async (file) => {
        try {
          const buffer = await readFile(join(examplesDir, file));
          return { base64: buffer.toString('base64'), mimeType: 'image/png' };
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

    const imagePrompt = `Here are ${validRefs.length} example profile photos of existing AI employees. Study their style carefully — the rendering technique, lighting, and overall feel.

Generate a NEW profile photo for a ${gender} AI employee that matches this EXACT rendering style:
- 3D cartoon / Pixar-style character with slightly stylized proportions (slightly oversized head, large expressive eyes with detailed iris reflections)
- Soft matte skin with subsurface scattering — NOT glossy or plastic-looking
- Warm front-left key light with subtle rim light, same lighting approach as the examples
- Chest-up portrait, slight angle, looking at camera with a warm friendly expression
- Solid muted gradient background — choose a color NOT used in any of the reference images
- Visible fabric texture and detail on clothing
- Square aspect ratio

This character must look distinctly different from the reference examples. Be bold and creative — give them a completely different hairstyle, different clothing style, and different accessories. Avoid repeating any outfit, hairstyle, or color scheme from the examples.

IMPORTANT: Match the 3D cartoon rendering style exactly. Do NOT generate a photorealistic image.`;

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
