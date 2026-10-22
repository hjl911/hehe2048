'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { deflateRawSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const table = Array.from({ length: 256 }, (_, n) => {
  let crc = n; for (let i = 0; i < 8; i++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(data) {
  let crc = 0xffffffff; for (const byte of data) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const file = path.join(dir, entry.name); return entry.isDirectory() ? files(file) : [file];
  });
}
const local = [], central = [];
let offset = 0;
const date = new Date();
const timeField = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
const dateField = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
for (const file of files(path.join(root, 'minigame'))) {
  const name = Buffer.from(path.relative(root, file).split(path.sep).join('/'));
  const source = fs.readFileSync(file), compressed = deflateRawSync(source), crc = crc32(source);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
  header.writeUInt16LE(8, 8); header.writeUInt16LE(timeField, 10); header.writeUInt16LE(dateField, 12);
  header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(source.length, 22);
  header.writeUInt16LE(name.length, 26);
  const record = Buffer.alloc(46);
  record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6);
  record.writeUInt16LE(0x800, 8); record.writeUInt16LE(8, 10); record.writeUInt16LE(timeField, 12); record.writeUInt16LE(dateField, 14);
  record.writeUInt32LE(crc, 16); record.writeUInt32LE(compressed.length, 20); record.writeUInt32LE(source.length, 24);
  record.writeUInt16LE(name.length, 28); record.writeUInt32LE(offset, 42);
  local.push(header, name, compressed); central.push(record, name);
  offset += header.length + name.length + compressed.length;
}
const directory = Buffer.concat(central), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10);
end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
const output = path.join(root, 'dist', 'hehe2048-0.1.0.zip');
fs.writeFileSync(output, Buffer.concat([...local, directory, end]));
console.log(output + ' (' + fs.statSync(output).size + ' bytes)');
