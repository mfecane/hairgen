import { HairCardBakeMapResult } from '@/lib/hair/bake/HairCardBakeTypes'
import JSZip from 'jszip'

/** Bundles a bake's rendered maps into one zip for the browser download - see BrowserFileDownloader. */
export class HairCardBakeZipBuilder {
	public async build(maps: HairCardBakeMapResult[]): Promise<Blob> {
		const zip = new JSZip()
		maps.forEach((map) => zip.file(`hair-texture-${map.kind}.png`, map.blob))
		return zip.generateAsync({ type: 'blob' })
	}
}
