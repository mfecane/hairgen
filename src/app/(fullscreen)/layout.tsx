export default function FullscreenLayout({ children }: { children: React.ReactNode }) {
	return <div className="fixed inset-0 max-h-screen">{children}</div>
}
