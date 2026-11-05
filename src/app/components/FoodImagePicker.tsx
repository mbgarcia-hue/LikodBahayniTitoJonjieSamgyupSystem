import { useEffect, useState, type DragEvent, type ChangeEvent } from 'react';
import { ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { fallbackFoodImage } from '../lib/menuImages';

interface FoodImagePickerProps {
  image?: string;
  file: File | null;
  label: string;
  disabled?: boolean;
  compact?: boolean;
  onFileChange: (file: File | null) => void;
}

const maximumImageSize = 3 * 1024 * 1024;

export default function FoodImagePicker({ image, file, label, disabled = false, compact = false, onFileChange }: FoodImagePickerProps) {
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState('');

  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function choose(candidate?: File) {
    if (!candidate || disabled) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(candidate.type)) {
      toast.error('Choose a JPEG, PNG or WebP food photo.');
      return;
    }
    if (candidate.size > maximumImageSize) {
      toast.error('Choose a food photo smaller than 3 MB.');
      return;
    }
    onFileChange(candidate);
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    choose(event.currentTarget.files?.[0]);
    event.currentTarget.value = '';
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files[0]);
  }

  return (
    <label
      className={`food-image-picker ${compact ? 'food-image-picker-compact' : ''} ${dragging ? 'is-dragging' : ''} ${disabled ? 'is-disabled' : ''}`}
      onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <img
        src={preview || image || fallbackFoodImage}
        alt=""
        onError={event => { event.currentTarget.src = fallbackFoodImage; }}
      />
      <span className="food-image-picker-prompt"><ImagePlus aria-hidden="true" />{compact ? 'Add photo' : 'Drop a food photo here or browse'}</span>
      <span className="sr-only">{label}</span>
      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} aria-label={label} onChange={onInputChange} />
    </label>
  );
}
