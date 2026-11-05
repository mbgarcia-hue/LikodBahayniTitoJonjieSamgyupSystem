import { useState } from 'react';
import { toast } from 'sonner';
import { useRestaurant } from '../context/RestaurantContext';
import type { InventoryItem } from '../data/restaurantData';
import FoodImagePicker from './FoodImagePicker';
import { defaultMenuImage } from '../lib/menuImages';

export default function InventoryImageEditor({ item }: { item: InventoryItem }) {
  const { uploadInventoryImage } = useRestaurant();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function selectImage(next: File | null) {
    setFile(next);
    if (!next || busy) return;
    setBusy(true);
    try {
      if (await uploadInventoryImage(item.id, next)) {
        setFile(null);
        toast.success(`${item.name} photo updated.`);
      }
    } finally {
      setBusy(false);
    }
  }

  return <FoodImagePicker
    image={item.image || defaultMenuImage({ name: item.name, category: 'Meat' })}
    file={file}
    label={`Food photo for ${item.name}`}
    disabled={busy}
    compact
    onFileChange={next => { void selectImage(next); }}
  />;
}
