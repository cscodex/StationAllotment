import { PDFDocument, rgb, degrees } from 'pdf-lib';
import fs from 'fs';
import QRCode from 'qrcode';

async function createOMRSample() {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]); // A4 Size

    const { width, height } = page.getSize();
    const black = rgb(0, 0, 0);

    // 1. Draw 4 Corner Anchor Markers (Fiducials)
    const markerSize = 20;
    const padding = 30;

    // Top-Left
    page.drawRectangle({ x: padding, y: height - padding - markerSize, width: markerSize, height: markerSize, color: black });
    // Top-Right
    page.drawRectangle({ x: width - padding - markerSize, y: height - padding - markerSize, width: markerSize, height: markerSize, color: black });
    // Bottom-Left
    page.drawRectangle({ x: padding, y: padding, width: markerSize, height: markerSize, color: black });
    // Bottom-Right
    page.drawRectangle({ x: width - padding - markerSize, y: padding, width: markerSize, height: markerSize, color: black });

    // 2. Student Info Header
    page.drawText('STATION ALLOTMENT - COUNSELING PREFERENCE FORM', { x: 90, y: height - 60, size: 14, color: black });
    page.drawText('Name: GURPREET SINGH', { x: 60, y: height - 100, size: 12 });
    page.drawText('Application No: APP-2025-001', { x: 60, y: height - 120, size: 12 });
    page.drawText('Merit Number: 14', { x: 60, y: height - 140, size: 12 });

    // 3. Insert QR Code
    // Create a payload the scanner will instantly parse
    const qrBase64 = await QRCode.toDataURL(JSON.stringify({ id: "stu_fake123", app: "APP-2025-001" }));
    const qrImage = await doc.embedPng(qrBase64);
    page.drawImage(qrImage, {
        x: width - 130,
        y: height - 160,
        width: 80,
        height: 80
    });

    // 4. Instructions
    page.drawText('INSTRUCTIONS: Fill ONE circle per row completely with a dark pen or pencil. Do not use checkmarks.', { x: 60, y: height - 190, size: 10 });

    // 5. OMR Bubble Grid (10 Choices x 10 Districts)
    const startX = 140;
    const startY = height - 320;
    const rowSpacing = 35;
    const colSpacing = 35;

    const schoolDistricts = [
        "Amritsar", "Bathinda", "Faridkot", "Ferozepur", "Gurdaspur",
        "Jalandhar", "Ludhiana", "Patiala", "Sangrur", "SAS Nagar"
    ];

    // Draw Header Labels (Sideways)
    for (let c = 0; c < schoolDistricts.length; c++) {
        page.drawText(schoolDistricts[c], {
            x: startX + c * colSpacing,
            y: startY + 20,
            size: 10,
            rotate: degrees(45)
        });
    }

    // Draw 10 Choice Rows
    for (let r = 0; r < 10; r++) {
        page.drawText(`Choice ${r + 1}`, { x: 60, y: startY - r * rowSpacing - 4, size: 12 });

        for (let c = 0; c < schoolDistricts.length; c++) {
            // Draw hollow circles (bubbles)
            page.drawCircle({
                x: startX + c * colSpacing + 10,
                y: startY - r * rowSpacing,
                size: 8,
                borderWidth: 1.5,
                borderColor: black,
            });

            // Let's pretend the student filled Choice 1 = Jalandhar
            if (r === 0 && c === 5) {
                page.drawCircle({
                    x: startX + c * colSpacing + 10,
                    y: startY - r * rowSpacing,
                    size: 7,
                    color: black,
                });
            }

            // Choice 2 = Bathinda
            if (r === 1 && c === 1) {
                page.drawCircle({
                    x: startX + c * colSpacing + 10,
                    y: startY - r * rowSpacing,
                    size: 7,
                    color: black,
                });
            }
        }
    }

    // Admin Signature Box
    page.drawRectangle({
        x: 60,
        y: 80,
        width: 200,
        height: 60,
        borderColor: black,
        borderWidth: 1
    });
    page.drawText('Signature of Verifying Officer', { x: 70, y: 65, size: 10 });

    // Convert to Bytes and Save
    const pdfBytes = await doc.save();
    fs.writeFileSync('client/public/sample_omr.pdf', pdfBytes);
    console.log('Sample updated for 10 School Districts at: client/public/sample_omr.pdf');
}

createOMRSample().catch(console.error);
