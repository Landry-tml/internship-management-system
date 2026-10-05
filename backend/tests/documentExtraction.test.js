const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const pdfParse = require('pdf-parse');
let pdfParseText = 'PDF report text';
let pdfParseError = null;
let pdfParseDelay = 0;
let concurrentPdfParses = 0;
let maxConcurrentPdfParses = 0;
const pdfParseMock = async (buffer) => {
    pdfParseMock.lastBuffer = buffer;
    concurrentPdfParses++;
    maxConcurrentPdfParses = Math.max(maxConcurrentPdfParses, concurrentPdfParses);
    try {
        if (pdfParseDelay) await new Promise((resolve) => setTimeout(resolve, pdfParseDelay));
        if (pdfParseError) throw pdfParseError;
        return { text: pdfParseText };
    } finally {
        concurrentPdfParses--;
    }
};
require.cache[require.resolve('pdf-parse')].exports = pdfParseMock;
const mammoth = require('mammoth');
const { extractDocumentText } = require('../services/aiService');

const mimeTypes = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    text: 'text/plain'
};

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) {
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function createDocx() {
    const files = [
        ['[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
        ['_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
        ['word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX evaluation notes</w:t></w:r></w:p></w:body></w:document>']
    ];
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const [name, contents] of files) {
        const nameBuffer = Buffer.from(name);
        const data = Buffer.from(contents);
        const checksum = crc32(data);
        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034b50, 0);
        localHeader.writeUInt16LE(20, 4);
        localHeader.writeUInt32LE(checksum, 14);
        localHeader.writeUInt32LE(data.length, 18);
        localHeader.writeUInt32LE(data.length, 22);
        localHeader.writeUInt16LE(nameBuffer.length, 26);
        localParts.push(localHeader, nameBuffer, data);

        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(0x02014b50, 0);
        centralHeader.writeUInt16LE(20, 4);
        centralHeader.writeUInt16LE(20, 6);
        centralHeader.writeUInt32LE(checksum, 16);
        centralHeader.writeUInt32LE(data.length, 20);
        centralHeader.writeUInt32LE(data.length, 24);
        centralHeader.writeUInt16LE(nameBuffer.length, 28);
        centralHeader.writeUInt32LE(offset, 42);
        centralParts.push(centralHeader, nameBuffer);
        offset += localHeader.length + nameBuffer.length + data.length;
    }

    const centralDirectory = Buffer.concat(centralParts);
    const endRecord = Buffer.alloc(22);
    endRecord.writeUInt32LE(0x06054b50, 0);
    endRecord.writeUInt16LE(files.length, 8);
    endRecord.writeUInt16LE(files.length, 10);
    endRecord.writeUInt32LE(centralDirectory.length, 12);
    endRecord.writeUInt32LE(offset, 16);
    return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

test('extracts PDF and DOCX text for the AI review flow', async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-document-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const pdfPath = path.join(directory, 'report.pdf');
    const docxPath = path.join(directory, 'evaluation.docx');
    await fs.writeFile(pdfPath, '%PDF-1.7 test');
    await fs.writeFile(docxPath, createDocx());

    pdfParseText = 'PDF report text';
    assert.match(await extractDocumentText(pdfPath, mimeTypes.pdf), /PDF report text/);
    assert.ok(Buffer.isBuffer(pdfParseMock.lastBuffer));
    assert.notEqual(pdfParse, pdfParseMock);
    assert.equal(await extractDocumentText(docxPath, mimeTypes.docx), 'DOCX evaluation notes');
});

test('reads TXT files directly without supplied text', async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-document-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const textPath = path.join(directory, 'notes.txt');
    await fs.writeFile(textPath, '  Course notes from the uploaded file.  ');

    assert.equal(await extractDocumentText(textPath, mimeTypes.text), 'Course notes from the uploaded file.');
});

test('serializes PDF parser access across concurrent document requests', async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-document-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    t.after(() => { pdfParseDelay = 0; });
    const paths = ['first.pdf', 'second.pdf'].map((name) => path.join(directory, name));
    await Promise.all(paths.map((filePath) => fs.writeFile(filePath, '%PDF-1.7 test')));
    pdfParseDelay = 10;
    maxConcurrentPdfParses = 0;

    const results = await Promise.all(paths.map((filePath) => extractDocumentText(filePath, mimeTypes.pdf)));

    assert.deepEqual(results, ['PDF report text', 'PDF report text']);
    assert.equal(maxConcurrentPdfParses, 1);
    pdfParseDelay = 0;
});

test('returns actionable errors for invalid, unreadable, and empty documents', async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-document-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const invalidPath = path.join(directory, 'invalid.pdf');
    await fs.writeFile(invalidPath, 'not a PDF');
    await assert.rejects(extractDocumentText(invalidPath, mimeTypes.pdf), {
        statusCode: 400,
        message: 'File content does not match the declared document type.'
    });

    const emptyPdfPath = path.join(directory, 'empty.pdf');
    await fs.writeFile(emptyPdfPath, '%PDF-1.7 empty');
    pdfParseText = '   ';
    await assert.rejects(extractDocumentText(emptyPdfPath, mimeTypes.pdf), {
        statusCode: 422,
        message: /No readable text/
    });

    pdfParseText = 'PDF report text';
    pdfParseError = new Error('parser details');
    await assert.rejects(extractDocumentText(emptyPdfPath, mimeTypes.pdf), {
        statusCode: 422,
        message: /Upload a readable, unencrypted PDF/
    });
    pdfParseError = null;

    const brokenDocxPath = path.join(directory, 'broken.docx');
    await fs.writeFile(brokenDocxPath, Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    await assert.rejects(extractDocumentText(brokenDocxPath, mimeTypes.docx), {
        statusCode: 422,
        message: /Upload a readable, unencrypted DOCX/
    });
});
