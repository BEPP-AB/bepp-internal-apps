import "./style.css";
import Cropper from "cropperjs";
import "cropperjs/dist/cropper.css";
import { generateSignatureHtml, SignatureData } from "./template";

// DOM Elements
const form = document.getElementById("signature-form") as HTMLFormElement;
const nameInput = document.getElementById("name") as HTMLInputElement;
const titleInput = document.getElementById("title") as HTMLInputElement;
const emailInput = document.getElementById("email") as HTMLInputElement;
const phoneInput = document.getElementById("phone") as HTMLInputElement;
const photoUrlInput = document.getElementById("photoUrl") as HTMLInputElement;
const previewContainer = document.getElementById(
  "signature-preview",
) as HTMLDivElement;
const copyBtn = document.getElementById("copy-btn") as HTMLButtonElement;
const toast = document.getElementById("toast") as HTMLDivElement;

// Photo upload elements
const photoUploadArea = document.getElementById("photo-upload-area") as HTMLDivElement;
const photoFileInput = document.getElementById("photoFile") as HTMLInputElement;
const uploadPlaceholder = document.getElementById("upload-placeholder") as HTMLDivElement;
const uploadPreview = document.getElementById("upload-preview") as HTMLDivElement;
const previewImage = document.getElementById("preview-image") as HTMLImageElement;
const removePhotoBtn = document.getElementById("remove-photo-btn") as HTMLButtonElement;

// Crop modal elements
const cropModal = document.getElementById("crop-modal") as HTMLDivElement;
const cropImage = document.getElementById("crop-image") as HTMLImageElement;
const cropConfirmBtn = document.getElementById("crop-confirm-btn") as HTMLButtonElement;
const cropCancelBtn = document.getElementById("crop-cancel-btn") as HTMLButtonElement;
const cropCancelBtnFooter = document.getElementById("crop-cancel-btn-footer") as HTMLButtonElement;
const cropBtnText = document.getElementById("crop-btn-text") as HTMLSpanElement;
const cropBtnLoading = document.getElementById("crop-btn-loading") as HTMLSpanElement;

let cropper: Cropper | null = null;

// Get form data
function getFormData(): SignatureData {
  return {
    name: nameInput.value.trim(),
    title: titleInput.value.trim(),
    email: emailInput.value.trim(),
    phone: phoneInput.value.trim(),
    photoUrl: photoUrlInput.value.trim(),
  };
}

// Update preview
function updatePreview(): void {
  const data = getFormData();

  // Only show preview if at least name is filled
  if (data.name || data.title || data.email || data.phone) {
    const html = generateSignatureHtml(data);
    previewContainer.innerHTML = html;
  } else {
    previewContainer.innerHTML = "";
  }
}

// Auto-generate email from name
function autoGenerateEmail(): void {
  const name = nameInput.value.trim();

  // Only auto-fill if email is empty and name has value
  if (!emailInput.value && name) {
    const emailName = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/\s+/g, ".")
      .replace(/[^a-z.]/g, "");

    if (emailName) {
      emailInput.value = `${emailName}@bepp.se`;
    }
  }
}

// Show toast notification
function showToast(message: string): void {
  toast.textContent = message;
  toast.classList.remove("hidden");
  toast.classList.add("visible");

  setTimeout(() => {
    toast.classList.remove("visible");
    toast.classList.add("hidden");
  }, 2500);
}

// Copy HTML to clipboard
async function copyToClipboard(): Promise<void> {
  const data = getFormData();

  if (!data.name) {
    showToast("Please fill in at least a name");
    return;
  }

  const html = generateSignatureHtml(data);

  try {
    await navigator.clipboard.writeText(html);
    showToast("Copied to clipboard!");
  } catch (err) {
    // Fallback for older browsers
    const textarea = document.createElement("textarea");
    textarea.value = html;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    showToast("Copied to clipboard!");
  }
}

// Open crop modal
function openCropModal(imageSrc: string): void {
  cropImage.src = imageSrc;
  cropModal.hidden = false;
  document.body.style.overflow = "hidden";

  // Initialize cropper after image loads
  cropImage.onload = () => {
    if (cropper) {
      cropper.destroy();
    }
    cropper = new Cropper(cropImage, {
      aspectRatio: 1,
      viewMode: 1,
      dragMode: "move",
      autoCropArea: 1,
      cropBoxResizable: true,
      cropBoxMovable: true,
      guides: true,
      center: true,
      highlight: false,
      background: false,
    });
  };
}

// Close crop modal
function closeCropModal(): void {
  cropModal.hidden = true;
  document.body.style.overflow = "";
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
  // Reset file input
  photoFileInput.value = "";
}

// Upload cropped image to server
async function uploadCroppedImage(): Promise<void> {
  if (!cropper) return;

  // Show loading state
  cropBtnText.hidden = true;
  cropBtnLoading.hidden = false;
  cropConfirmBtn.disabled = true;

  try {
    // Get cropped canvas
    const canvas = cropper.getCroppedCanvas({
      width: 280, // 2x the display size for retina
      height: 280,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    });

    // Convert canvas to blob
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error("Failed to create blob"));
        },
        "image/jpeg",
        0.9
      );
    });

    // Create form data
    const formData = new FormData();
    formData.append("file", blob, "photo.jpg");

    // Upload to server
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Upload failed");
    }

    const result = await response.json();

    // Set the photo URL
    photoUrlInput.value = result.url;

    // Update preview display
    previewImage.src = result.url;
    uploadPlaceholder.hidden = true;
    uploadPreview.hidden = false;

    // Close modal and update signature preview
    closeCropModal();
    updatePreview();
    showToast("Photo uploaded successfully!");
  } catch (error) {
    console.error("Upload error:", error);
    showToast(error instanceof Error ? error.message : "Failed to upload photo");
  } finally {
    // Reset loading state
    cropBtnText.hidden = false;
    cropBtnLoading.hidden = true;
    cropConfirmBtn.disabled = false;
  }
}

// Remove uploaded photo
function removePhoto(): void {
  photoUrlInput.value = "";
  previewImage.src = "";
  uploadPlaceholder.hidden = false;
  uploadPreview.hidden = true;
  photoFileInput.value = "";
  updatePreview();
}

// Handle file selection
function handleFileSelect(file: File): void {
  if (!file.type.startsWith("image/")) {
    showToast("Please select an image file");
    return;
  }

  const maxSize = 10 * 1024 * 1024; // 10MB for initial file (will be compressed after crop)
  if (file.size > maxSize) {
    showToast("File size must be less than 10MB");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    if (e.target?.result) {
      openCropModal(e.target.result as string);
    }
  };
  reader.readAsDataURL(file);
}

// Photo upload event listeners
photoUploadArea.addEventListener("click", (e) => {
  // Don't trigger if clicking the remove button or preview
  if ((e.target as HTMLElement).closest("#remove-photo-btn")) return;
  if ((e.target as HTMLElement).closest("#upload-preview") && !uploadPreview.hidden) return;
  photoFileInput.click();
});

photoFileInput.addEventListener("change", () => {
  const file = photoFileInput.files?.[0];
  if (file) {
    handleFileSelect(file);
  }
});

// Drag and drop
photoUploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  photoUploadArea.classList.add("drag-over");
});

photoUploadArea.addEventListener("dragleave", () => {
  photoUploadArea.classList.remove("drag-over");
});

photoUploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  photoUploadArea.classList.remove("drag-over");
  const file = e.dataTransfer?.files[0];
  if (file) {
    handleFileSelect(file);
  }
});

removePhotoBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  removePhoto();
});

// Crop modal event listeners
cropConfirmBtn.addEventListener("click", uploadCroppedImage);
cropCancelBtn.addEventListener("click", closeCropModal);
cropCancelBtnFooter.addEventListener("click", closeCropModal);

// Close modal on escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !cropModal.hidden) {
    closeCropModal();
  }
});

// Close modal on overlay click
cropModal.addEventListener("click", (e) => {
  if (e.target === cropModal) {
    closeCropModal();
  }
});

// Event listeners
form.addEventListener("input", updatePreview);

nameInput.addEventListener("blur", () => {
  autoGenerateEmail();
  updatePreview();
});

copyBtn.addEventListener("click", copyToClipboard);

// Initialize with empty preview
updatePreview();
