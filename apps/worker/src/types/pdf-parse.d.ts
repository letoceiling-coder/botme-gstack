declare module 'pdf-parse' {
  interface PdfData {
    text: string;
    numpages: number;
  }
  function pdfParse(buffer: Buffer): Promise<PdfData>;
  export default pdfParse;
}
