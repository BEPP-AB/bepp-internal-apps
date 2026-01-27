import "./style.css";
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

// Event listeners
form.addEventListener("input", updatePreview);

nameInput.addEventListener("blur", () => {
  autoGenerateEmail();
  updatePreview();
});

copyBtn.addEventListener("click", copyToClipboard);

// Initialize with empty preview
updatePreview();
