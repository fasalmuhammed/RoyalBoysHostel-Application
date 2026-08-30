/** Metro resolves font files as assets; TypeScript needs to be told they exist. */
declare module "*.ttf" {
  const asset: number;
  export default asset;
}
