import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const ASSETS_DIR = path.join(process.cwd(), 'public/assets');
const BUILDINGS_DIR = path.join(ASSETS_DIR, 'buildings');
const CHARACTERS_DIR = path.join(ASSETS_DIR, 'characters');

const UI_DIR = path.join(ASSETS_DIR, 'ui');

async function processDirectory(dir, isBuilding, isUI = false) {
    if (!fs.existsSync(dir)) {
        console.log(`Directory not found: ${dir}`);
        return;
    }

    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filePath = path.join(dir, file);
        const ext = path.extname(file).toLowerCase();
        const name = path.parse(file).name;

        if (!['.jpg', '.jpeg', '.png'].includes(ext)) continue;

        console.log(`Processing ${file}...`);

        let pipeline = sharp(filePath);
        const metadata = await pipeline.metadata();

        // Resize rules
        if (isUI) {
             // UI elements: subtle resize or just optimization
             // For buttons, keep them crisp but not huge if they are massive
             if (metadata.width > 800) {
                 pipeline = pipeline.resize(Math.round(metadata.width * 0.75));
             }
        } else {
             // Cards
             pipeline = pipeline.resize(Math.round(metadata.width * 0.5));
        }

        if (isBuilding) {
            // Buildings: Force JPG, Quality 80
            const newFilename = `${name}.jpg`;
            const newPath = path.join(dir, newFilename);
            
            await pipeline
                .jpeg({ quality: 80, mozjpeg: true })
                .toFile(newPath + '.tmp'); // Write to temp first

            fs.renameSync(newPath + '.tmp', newPath);
            
            // If the original wasn't jpg (e.g. png), or even if it was, we overwrite/replace
            if (ext !== '.jpg' && ext !== '.jpeg') {
                fs.unlinkSync(filePath); // Remove the old PNG
                console.log(`  -> Converted to JPG: ${newFilename}`);
            } else {
                console.log(`  -> Optimized JPG: ${newFilename}`);
            }
        } else {
            // Characters/UI: Keep PNG (transparency), Quality 80
            const newPath = path.join(dir, file); // Overwrite same file
            
            await pipeline
                .png({ quality: 80, compressionLevel: 9 })
                .toFile(newPath + '.tmp');

            fs.renameSync(newPath + '.tmp', newPath);
            console.log(`  -> Optimized PNG: ${file}`);
        }
    }
}

async function main() {
    console.log("🏰 Optimizing Citadel Assets...");
    await processDirectory(BUILDINGS_DIR, true);  // Convert to JPG
    await processDirectory(CHARACTERS_DIR, false); // Keep PNG
    await processDirectory(UI_DIR, false, true); // Keep PNG, UI mode
    console.log("✅ Done!");
}

main();
