<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface Props {
  maxFiles?: number
  acceptedFormats?: string[]
  initialFiles?: File[]
}

interface Emits {
  filesSelected: [files: File[]]
}

const props = withDefaults(defineProps<Props>(), {
  maxFiles: 10,
  acceptedFormats: () => ['pdf', 'docx', 'doc'],
  initialFiles: () => [],
})

const emit = defineEmits<Emits>()

const uploadedFiles = ref<File[]>([])
const isDragging = ref(false)
const errorMessage = ref('')
const fileInput = ref<HTMLInputElement>()

const acceptString = computed(() => props.acceptedFormats.map((format) => `.${format}`).join(','))

watch(
  () => props.initialFiles,
  (nextFiles) => {
    uploadedFiles.value = [...nextFiles]
  },
  { immediate: true },
)

function handleDragOver(event: DragEvent) {
  event.preventDefault()
  isDragging.value = true
}

function handleDragLeave(event: DragEvent) {
  event.preventDefault()
  isDragging.value = false
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  isDragging.value = false
  errorMessage.value = ''
  processFiles(Array.from(event.dataTransfer?.files || []))
}

function handleFileInput(event: Event) {
  const target = event.target as HTMLInputElement
  processFiles(Array.from(target.files || []))
  target.value = ''
}

function processFiles(files: File[]) {
  errorMessage.value = ''

  if (files.length === 0) {
    uploadedFiles.value = []
    emit('filesSelected', [])
    return
  }

  const invalidFiles = files.filter((file) => {
    const extension = file.name.split('.').pop()?.toLowerCase()
    return !extension || !props.acceptedFormats.includes(extension)
  })

  if (invalidFiles.length > 0) {
    errorMessage.value = `Use ${props.acceptedFormats.join(', ').toUpperCase()}`
    return
  }

  if (props.maxFiles === 1) {
    uploadedFiles.value = files.slice(0, 1)
  } else if (uploadedFiles.value.length + files.length <= props.maxFiles) {
    uploadedFiles.value = [...uploadedFiles.value, ...files]
  } else {
    errorMessage.value = `Max ${props.maxFiles} files`
    return
  }

  emit('filesSelected', [...uploadedFiles.value])
}

function removeFile(index: number) {
  uploadedFiles.value.splice(index, 1)
  errorMessage.value = ''
  emit('filesSelected', [...uploadedFiles.value])
}

function openFileDialog() {
  fileInput.value?.click()
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-4">
    <div
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
      :class="[
        'rounded-2xl border-2 border-dashed p-8 text-center transition',
        isDragging ? 'border-slate-500 bg-slate-100' : 'border-slate-200 bg-slate-50 hover:bg-slate-100',
      ]"
    >
      <p class="text-sm font-medium text-slate-700">Drop files or select</p>

      <button
        type="button"
        @click="openFileDialog"
        class="mt-4 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
      >
        Select files
      </button>

      <input
        ref="fileInput"
        type="file"
        :accept="acceptString"
        :multiple="maxFiles > 1"
        @change="handleFileInput"
        class="hidden"
      />
    </div>

    <div v-if="errorMessage" class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {{ errorMessage }}
    </div>

    <div class="mt-4 min-h-0 flex-1 overflow-hidden pr-1">
      <div class="max-h-56 space-y-2 overflow-y-auto">
        <div
          v-for="(file, index) in uploadedFiles"
          :key="`${file.name}-${index}`"
          class="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3"
        >
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-slate-900">{{ file.name }}</p>
            <p class="text-xs text-slate-500">{{ (file.size / 1024).toFixed(0) }} KB</p>
          </div>

          <button type="button" @click="removeFile(index)" class="ml-3 text-sm font-medium text-slate-500 hover:text-slate-900">
            Remove
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
