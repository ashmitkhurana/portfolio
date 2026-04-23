import React from 'react';

type Props = { children: React.ReactNode };
type State = { error: Error | null };

export default class ErrorBoundary extends React.Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { error: null };
	}

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	componentDidCatch(error: Error, info: React.ErrorInfo) {
		// eslint-disable-next-line no-console
		console.error('ErrorBoundary caught:', error, info);
	}

	render() {
		if (this.state.error) {
			return (
				<div style={{ padding: 16 }}>
					<div
						style={{
							position: 'fixed',
							top: 0,
							left: 0,
							right: 0,
							background: '#7f1d1d',
							color: 'white',
							padding: '12px 16px',
							zIndex: 99999,
							fontFamily:
								'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
						}}
					>
						<strong>Runtime error:</strong> {this.state.error.message}
					</div>
					{this.props.children}
				</div>
			);
		}
		return this.props.children;
	}
}

