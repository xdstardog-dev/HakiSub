import { createApp } from 'vue'
import App from './App.vue'
import { installDialogBackdropFallback } from './dialogBackdrop'
import './style.css'
installDialogBackdropFallback()
createApp(App).mount('#app')
