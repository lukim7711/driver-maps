function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

/**
 * Kompresi gambar di sisi browser menggunakan HTML5 Canvas.
 * @param {File} file - File gambar asli
 * @param {Object} options
 * @param {number} options.maxDimension - Dimensi maksimum (lebar/tinggi) dalam px
 * @param {number} options.quality - Kualitas JPEG (0.0 - 1.0)
 * @param {number} options.sizeThreshold - Skip kompresi jika file < bytes ini
 * @returns {Promise<{file: File, originalSize: number, compressedSize: number, skipped: boolean}>}
 */
export async function compressImage(file, options = {}) {
    const {
        maxDimension = 1200,
        quality = 0.75,
        sizeThreshold = 500 * 1024
    } = options;

    const originalSize = file.size;

    if (originalSize <= sizeThreshold) {
        return { file, originalSize, compressedSize: originalSize, skipped: true };
    }

    let objectUrl = null;
    try {
        objectUrl = URL.createObjectURL(file);
        const image = await loadImage(objectUrl);

        let { width, height } = image;
        if (width > height && width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
        } else if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, width, height);

        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(
                (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
                'image/jpeg',
                quality
            );
        });

        const compressedFile = new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now()
        });

        return {
            file: compressedFile,
            originalSize,
            compressedSize: compressedFile.size,
            skipped: false
        };
    } catch (err) {
        console.warn('Image compression failed, using original:', err.message);
        return { file, originalSize, compressedSize: originalSize, skipped: true };
    } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
}

/**
 * Kompresi array file secara paralel.
 * @param {File[]} files
 * @param {Function} onProgress - callback(completed, total)
 * @returns {Promise<Array<{file: File, originalSize: number, compressedSize: number, skipped: boolean}>>}
 */
export async function compressImages(files, onProgress) {
    const results = [];
    let completed = 0;
    const total = files.length;

    const tasks = files.map(async (file) => {
        const result = await compressImage(file);
        results.push(result);
        completed++;
        if (onProgress) onProgress(completed, total);
        return result;
    });

    await Promise.all(tasks);
    return results;
}
