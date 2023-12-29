#!/usr/bin/env ts-node

import 'dotenv/config';
import { ArgumentParser } from 'argparse';
import p from 'path';
import fs from 'fs';
import ElevenLabs from 'elevenlabs-node';
import { AudioEditingService } from './src/utils';
import { v4 } from 'uuid';

const parser = new ArgumentParser();
parser.add_argument('file');
parser.add_argument('-s', '--stability', { default: 1.0 });
parser.add_argument('-b', '--similarityBoost', { default: 0.5 });
parser.add_argument('-t', '--style', { default: 0.3 });
parser.add_argument('-o', '--outputName', { default: 'final.wav' });
parser.add_argument('--projectRoot', { default: p.resolve('./out') });
parser.add_argument('--projectPath', { default: undefined });
parser.add_argument('-i', '--indexes', { default: undefined, nargs: '*' });
parser.add_argument('-r', '--pattern', { default: undefined, nargs: '*' });
parser.add_argument('-v', '--voiceId', { default: 'Vb6nEky6ikh2kpFC9qz9' });
parser.add_argument('-w', '--overwrite', { default: undefined, action: 'store_true' });
parser.add_argument('--scriptsPath', { default: p.resolve('./scripts') });
parser.add_argument('--scriptsExt', { default: 'txt' });
parser.add_argument('-p', '--project', { default: v4() });

const args = parser.parse_args();

const voice = new ElevenLabs({
  apiKey: process.env.ELEVEN_LABS_API_KEY,
  voiceId: args.voice,
});

type ExportOptions = {
  project: string;
  projectPath: string;
  outputName: string;
}

type ElevenLabsApiOptions = {
  voiceId: string;
  stability: number;
  similarityBoost: number;
  modelId: string;
  style: number;
  speakerBoost: boolean;
}

type TextToSpeechOptions = ElevenLabsApiOptions & ExportOptions & {
  indexes: number[];
  pattern: string | string[];
  overwrite: boolean;
}

export async function generateAndMerge(text: string | string[], {
  voiceId,
  stability = 1.0,
  similarityBoost = 0.5,
  style = 0.3,
  speakerBoost = true,
  indexes,
  pattern,
  overwrite = Boolean(indexes || pattern),
  project = v4(),
  projectPath = p.join(args.projectRoot, project),
  outputName = 'final.wav',
}: Partial<TextToSpeechOptions> = {}) {

  if (!fs.existsSync(projectPath)) {
    fs.mkdirSync(projectPath, { recursive: true });
  }

  const sentences = (Array.isArray(text) ? text : text.split(/[.?!]|\\Z/)).map(s => s.trim()).filter(s => s.length > 0);
  const filenames = sentences.map((_, i) => p.join(projectPath, `sentence-${i}.mp3`));
  const regex = new RegExp(Array.isArray(pattern) ? pattern.join('|') : pattern, 'i');
  const matches = sentences.map((text, i) => regex.test(text) ? i : null).filter((i) => i !== null);
  const missing = sentences.map((_, i) => !fs.existsSync(filenames[i]) ? i : null).filter((i) => i !== null);
  indexes = Array.from(new Set(matches.length > 0 ? [...matches, ...(indexes ?? [])] : (indexes || sentences.map((_, i) => i))));

  for (const i of indexes) {
    const sentence = sentences[i];
    if (!overwrite && fs.existsSync(filenames[i])) {
      continue;
    }
    await voice.textToSpeech({
      fileName: filenames[i],
      textInput: sentence,
      voiceId,
      stability,
      similarityBoost,
      style,
      speakerBoost,
    });
  };

  const editor = new AudioEditingService();
  await editor.merge({ outputPath: p.join(projectPath, outputName) }, ...filenames.filter((_, i) => !missing.includes(i)));

}

async function main() {
  const path = p.join(args.scriptsPath, `${args.file}.${args.scriptsExt}`);
  const text = fs.readFileSync(path, { encoding: 'utf8' })
    .split(/\n\n/)
    .map((t) => t.trim())
    .filter(Boolean);
  await generateAndMerge(text, args);
}

main();