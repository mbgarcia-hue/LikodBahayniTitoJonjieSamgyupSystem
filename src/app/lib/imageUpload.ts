export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected food photo.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Could not read the selected food photo.'));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
