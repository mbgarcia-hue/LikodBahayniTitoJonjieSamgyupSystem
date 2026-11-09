import { useState } from 'react';
import { toast } from 'sonner';
import { useRestaurant } from '../context/RestaurantContext';
import type { InventoryItem } from '../data/restaurantData';
import FoodImagePicker from './FoodImagePicker';
import { defaultMenuImage } from '../lib/menuImages';

export default function InventoryImageEditor({ item, editable = true }: { item: InventoryItem; editable?: boolean }) {
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

  if (!editable) return <img
    src={item.image || defaultMenuImage({ name: item.name, category: 'Meat' })}
    alt={item.name}
    className="h-14 w-14 rounded-lg border border-amber-600/30 object-cover"
    onError={event => { event.currentTarget.src = defaultMenuImage({ name: item.name, category: 'Meat' }); }}
  />;

  return <FoodImagePicker
    image={item.image || defaultMenuImage({ name: item.name, category: 'Meat' })}
    file={file}
    label={`Food photo for ${item.name}`}
    disabled={busy}
    compact
    onFileChange={next => { void selectImage(next); }}
  />;
}
