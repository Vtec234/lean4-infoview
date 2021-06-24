const path = require("path");

module.exports = function(env) {
    env = env || {};
    const isDevelopment = !!env.development;

    return {
        mode: isDevelopment ? 'development' : 'production',
        devtool: isDevelopment && "inline-source-map",
        entry: "./src/index.ts",
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: 'ts-loader',
                    include: [
                        path.resolve(__dirname, "src"),
                    ],
                },
                {
                    test: /\.css$/i,
                    use: ['style-loader', 'css-loader'],
                },
                {
                    test: /\.(woff|woff2|ttf)$/,
                    type: 'asset/inline',
                },
            ],
        },
        resolve: {
            extensions: ['.tsx', '.ts', '.js'],
        },
        experiments: {
            outputModule: true,
        },
        output: {
            path: path.resolve(__dirname, "dist"),
            filename: "index.js",
            library: {
                type: "module",
            },
        },
    };
};