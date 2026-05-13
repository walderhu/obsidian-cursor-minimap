function throttle(fn, limit, options = { leading: false, trailing: true }) {
    let inThrottle = false;
    let lastArgs;
    let lastThis;

    const invoke = () => {
        if (lastArgs) {
            fn.apply(lastThis, lastArgs);
            lastArgs = lastThis = null;
            setTimeout(invoke, limit);
        } else {
            inThrottle = false;
        }
    };

    return function (...args) {
        if (!inThrottle) {
            if (options.leading) {
                fn.apply(this, args);
            } else {
                lastArgs = args;
                lastThis = this;
            }
            inThrottle = true;
            setTimeout(invoke, limit);
        } else if (options.trailing) {
            lastArgs = args;
            lastThis = this;
        }
    };
}

function toRGBAAlpha(color, alpha) {
    if (color.startsWith("#")) {
        let hex = color.replace("#", "");
        if (hex.length === 3) {
            hex = hex
                .split("")
                .map((x) => x + x)
                .join("");
        }
        const num = parseInt(hex, 16);
        const r = (num >> 16) & 255;
        const g = (num >> 8) & 255;
        const b = num & 255;
        return `rgba(${r},${g},${b},${alpha})`;
    }

    if (color.startsWith("rgb")) {
        const nums = color.match(/[\d.]+/g);
        if (nums.length >= 3) {
            return `rgba(${nums[0]},${nums[1]},${nums[2]},${alpha})`;
        }
    }

    return color;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
    sleep,
    throttle,
    toRGBAAlpha,
};
