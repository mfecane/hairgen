/** Hands the browser a file to save - a temporary object-URL anchor click, since there's no other download path in this app. */
export class BrowserFileDownloader {
	public download(blob: Blob, filename: string): void {
		const url = URL.createObjectURL(blob)
		const anchor = document.createElement('a')
		anchor.href = url
		anchor.download = filename
		document.body.appendChild(anchor)
		anchor.click()
		anchor.remove()
		URL.revokeObjectURL(url)
	}
}
