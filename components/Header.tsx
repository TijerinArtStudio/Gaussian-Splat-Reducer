
import React from 'react';

export const Header: React.FC = () => {
    return (
        <header className="text-center mb-8 sm:mb-12">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 mb-2">
                Gaussian Splat Reducer
            </h1>
            <p className="text-lg text-gray-400 max-w-xl mx-auto">
                Intelligently reduce .ply file size by removing the least significant splats based on their opacity and size.
            </p>
        </header>
    );
};
