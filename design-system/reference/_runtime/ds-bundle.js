/* @ds-bundle: {"format":4,"namespace":"ImpoclickDesignSystem_ec37fd","components":[{"name":"Avatar","sourcePath":"components/core/Avatar.jsx"},{"name":"AvatarGroup","sourcePath":"components/core/Avatar.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"ProgressBar","sourcePath":"components/core/ProgressBar.jsx"},{"name":"Stat","sourcePath":"components/core/Stat.jsx"},{"name":"Tag","sourcePath":"components/core/Tag.jsx"},{"name":"DataTable","sourcePath":"components/data/DataTable.jsx"},{"name":"DonutMeter","sourcePath":"components/data/DonutMeter.jsx"},{"name":"Legend","sourcePath":"components/data/DonutMeter.jsx"},{"name":"SparkBars","sourcePath":"components/data/SparkBars.jsx"},{"name":"Timeline","sourcePath":"components/data/Timeline.jsx"},{"name":"Alert","sourcePath":"components/feedback/Alert.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/EmptyState.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Tooltip","sourcePath":"components/feedback/Tooltip.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"SegmentedControl","sourcePath":"components/forms/SegmentedControl.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Breadcrumbs","sourcePath":"components/navigation/Breadcrumbs.jsx"},{"name":"NavPills","sourcePath":"components/navigation/NavPills.jsx"},{"name":"SideNav","sourcePath":"components/navigation/SideNav.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"},{"name":"TopBar","sourcePath":"components/navigation/TopBar.jsx"}],"sourceHashes":{"components/core/Avatar.jsx":"71961a26918a","components/core/Badge.jsx":"14cb87710b03","components/core/Button.jsx":"8f9aa6266eb4","components/core/Card.jsx":"3be6acda72c7","components/core/Icon.jsx":"58a5142d9151","components/core/IconButton.jsx":"0c9d81663130","components/core/ProgressBar.jsx":"3ef105b15e91","components/core/Stat.jsx":"032bdd77cef8","components/core/Tag.jsx":"d4ac8b747be2","components/data/DataTable.jsx":"7703258bd521","components/data/DonutMeter.jsx":"48e0eaf94813","components/data/SparkBars.jsx":"7793b608b51b","components/data/Timeline.jsx":"3380b8fac214","components/feedback/Alert.jsx":"d81874b7f8dd","components/feedback/EmptyState.jsx":"a26942adb913","components/feedback/Toast.jsx":"ca7b0755964d","components/feedback/Tooltip.jsx":"0d33bfa1ff0f","components/forms/Checkbox.jsx":"1443f85b9d40","components/forms/Input.jsx":"783fda096bc0","components/forms/SegmentedControl.jsx":"eca5a2005552","components/forms/Select.jsx":"e929ad5ebbaa","components/forms/Switch.jsx":"9b57b0cc98fb","components/navigation/Breadcrumbs.jsx":"016288b06954","components/navigation/NavPills.jsx":"fb21233d5625","components/navigation/SideNav.jsx":"f8a5057e2369","components/navigation/Tabs.jsx":"48c67bfe3d23","components/navigation/TopBar.jsx":"abf47bf1af0b","ui_kits/app/AppShell.jsx":"81298d17bd10","ui_kits/app/CostsScreen.jsx":"134f3bdf69be","ui_kits/app/DashboardScreen.jsx":"a3807923d547","ui_kits/app/ImportsScreen.jsx":"d5a8279a446f","ui_kits/app/QuoteScreen.jsx":"3ebd997bf955","ui_kits/app/ShipmentScreen.jsx":"7ba0d413e1d8","ui_kits/site/SiteBody.jsx":"06933ba57be5","ui_kits/site/SiteSections.jsx":"9bd0f9b629c0"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.ImpoclickDesignSystem_ec37fd = window.ImpoclickDesignSystem_ec37fd || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Avatar({
  src,
  name = '',
  size = 'md',
  accent = false,
  className = '',
  ...rest
}) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return /*#__PURE__*/React.createElement("span", _extends({
    className: ['ic-avatar', 'is-' + size, accent ? 'is-accent' : '', className].filter(Boolean).join(' '),
    title: name || undefined
  }, rest), src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name
  }) : initials);
}
function AvatarGroup({
  children,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    className: ['ic-avatar-group', className].filter(Boolean).join(' ')
  }, rest), children);
}
Object.assign(__ds_scope, { Avatar, AvatarGroup });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Card({
  children,
  title,
  eyebrow,
  action,
  variant = 'default',
  compact = false,
  interactive = false,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['ic-card', variant !== 'default' ? 'is-' + variant : '', compact ? 'is-compact' : '', interactive ? 'is-interactive' : '', className].filter(Boolean).join(' ')
  }, rest), (title || eyebrow || action) && /*#__PURE__*/React.createElement("div", {
    className: "ic-card__head"
  }, /*#__PURE__*/React.createElement("div", null, eyebrow && /*#__PURE__*/React.createElement("div", {
    className: "ic-card__eyebrow"
  }, eyebrow), title && /*#__PURE__*/React.createElement("div", {
    className: "ic-card__title"
  }, title)), action), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Material Symbols Rounded glyph. Pass the ligature name, e.g. "local_shipping". */
function Icon({
  name,
  size,
  filled = false,
  className = '',
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    className: ['ic-icon', filled ? 'is-filled' : '', className].filter(Boolean).join(' '),
    style: size ? {
      fontSize: typeof size === 'number' ? size + 'px' : size,
      ...style
    } : style,
    "aria-hidden": "true"
  }, rest), name);
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Badge({
  children,
  tone = 'neutral',
  icon,
  dot = false,
  solid = false,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    className: ['ic-badge', 'is-' + tone, solid ? 'is-solid' : '', className].filter(Boolean).join(' ')
  }, rest), dot && /*#__PURE__*/React.createElement("span", {
    className: "ic-badge__dot"
  }), icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Button({
  children,
  variant = 'primary',
  size = 'md',
  iconLeft,
  iconRight,
  block = false,
  disabled = false,
  as = 'button',
  className = '',
  ...rest
}) {
  const Tag = as;
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: ['ic-btn', 'is-' + variant, 'is-' + size, block ? 'is-block' : '', className].filter(Boolean).join(' '),
    disabled: Tag === 'button' ? disabled : undefined
  }, rest), iconLeft && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconLeft
  }), children, iconRight && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconRight
  }));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function IconButton({
  icon,
  label,
  size = 'md',
  variant = 'default',
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    "aria-label": label,
    className: ['ic-iconbtn', 'is-' + size, variant !== 'default' ? 'is-' + variant : '', className].filter(Boolean).join(' ')
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/ProgressBar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function ProgressBar({
  value = 0,
  max = 100,
  label,
  valueText,
  tone = 'accent',
  thick = false,
  className = '',
  ...rest
}) {
  const pct = Math.max(0, Math.min(100, value / max * 100));
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['ic-progress', 'is-' + tone, thick ? 'is-thick' : '', className].filter(Boolean).join(' ')
  }, rest), (label || valueText) && /*#__PURE__*/React.createElement("div", {
    className: "ic-progress__meta"
  }, label && /*#__PURE__*/React.createElement("span", {
    className: "ic-progress__label"
  }, label), valueText && /*#__PURE__*/React.createElement("span", {
    className: "ic-progress__value"
  }, valueText)), /*#__PURE__*/React.createElement("div", {
    className: "ic-progress__track",
    role: "progressbar",
    "aria-valuenow": value,
    "aria-valuemin": 0,
    "aria-valuemax": max
  }, /*#__PURE__*/React.createElement("div", {
    className: "ic-progress__fill",
    style: {
      width: pct + '%'
    }
  })));
}
Object.assign(__ds_scope, { ProgressBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/ProgressBar.jsx", error: String((e && e.message) || e) }); }

// components/core/Stat.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Stat({
  label,
  value,
  prefix,
  suffix,
  fraction,
  delta,
  deltaDirection = 'up',
  deltaNote,
  size = 'md',
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['ic-stat', 'is-' + size, className].filter(Boolean).join(' ')
  }, rest), label && /*#__PURE__*/React.createElement("div", {
    className: "ic-stat__label"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "ic-stat__value"
  }, prefix && /*#__PURE__*/React.createElement("span", {
    className: "ic-stat__unit"
  }, prefix), /*#__PURE__*/React.createElement("span", null, value), fraction && /*#__PURE__*/React.createElement("span", {
    className: "ic-stat__frac"
  }, fraction), suffix && /*#__PURE__*/React.createElement("span", {
    className: "ic-stat__unit"
  }, suffix)), delta && /*#__PURE__*/React.createElement("div", {
    className: 'ic-stat__delta is-' + deltaDirection
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: deltaDirection === 'up' ? 'trending_up' : deltaDirection === 'down' ? 'trending_down' : 'trending_flat'
  }), delta, deltaNote && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-muted)',
      fontWeight: 'var(--weight-medium)'
    }
  }, deltaNote)));
}
Object.assign(__ds_scope, { Stat });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Stat.jsx", error: String((e && e.message) || e) }); }

// components/core/Tag.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Tag({
  children,
  onRemove,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    className: ['ic-tag', onRemove ? '' : 'is-plain', className].filter(Boolean).join(' ')
  }, rest), children, onRemove && /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "ic-tag__x",
    onClick: onRemove,
    "aria-label": "Remover"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "close"
  })));
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tag.jsx", error: String((e && e.message) || e) }); }

// components/data/DataTable.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function DataTable({
  columns = [],
  rows = [],
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto',
      minWidth: 0,
      maxWidth: '100%'
    }
  }, /*#__PURE__*/React.createElement("table", _extends({
    className: ['ic-table', className].filter(Boolean).join(' ')
  }, rest), /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, columns.map(c => /*#__PURE__*/React.createElement("th", {
    key: c.key,
    className: c.align === 'right' ? 'is-num' : '',
    style: c.width ? {
      width: c.width
    } : undefined
  }, c.label)))), /*#__PURE__*/React.createElement("tbody", null, rows.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: r.id || i
  }, columns.map(c => /*#__PURE__*/React.createElement("td", {
    key: c.key,
    className: [c.align === 'right' ? 'is-num' : '', c.primary ? 'is-title' : ''].filter(Boolean).join(' ')
  }, c.render ? c.render(r) : r[c.key])))))));
}
Object.assign(__ds_scope, { DataTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/DataTable.jsx", error: String((e && e.message) || e) }); }

// components/data/DonutMeter.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function DonutMeter({
  segments = [],
  size = 168,
  thickness = 26,
  value,
  label,
  className = '',
  ...rest
}) {
  let acc = 0;
  const stops = segments.map(s => {
    const from = acc;
    acc += s.value;
    return `${s.color} ${from}% ${acc}%`;
  }).join(', ');
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['ic-donut', className].filter(Boolean).join(' '),
    style: {
      width: size,
      height: size
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "ic-donut__ring",
    style: {
      background: `conic-gradient(from -90deg, ${stops || 'var(--chart-track) 0% 100%'})`
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "ic-donut__hole",
    style: {
      width: size - thickness * 2,
      height: size - thickness * 2
    }
  }, /*#__PURE__*/React.createElement("div", null, value != null && /*#__PURE__*/React.createElement("div", {
    className: "ic-donut__value"
  }, value), label && /*#__PURE__*/React.createElement("div", {
    className: "ic-donut__label"
  }, label))));
}
function Legend({
  items = [],
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['ic-legend', className].filter(Boolean).join(' ')
  }, rest), items.map(i => /*#__PURE__*/React.createElement("span", {
    key: i.label,
    className: "ic-legend__item"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ic-legend__swatch",
    style: {
      background: i.color
    }
  }), i.label)));
}
Object.assign(__ds_scope, { DonutMeter, Legend });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/DonutMeter.jsx", error: String((e && e.message) || e) }); }

// components/data/SparkBars.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function SparkBars({
  data = [],
  labels = [],
  peakIndex,
  height = 88,
  className = '',
  ...rest
}) {
  const max = Math.max(...data, 1);
  const peak = peakIndex != null ? peakIndex : data.indexOf(Math.max(...data));
  return /*#__PURE__*/React.createElement("div", _extends({
    className: className
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "ic-sparkbars",
    style: {
      height
    }
  }, data.map((v, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: 'ic-sparkbars__bar' + (i === peak ? ' is-peak' : ''),
    style: {
      height: Math.max(6, v / max * 100) + '%'
    },
    title: String(v)
  }))), labels.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "ic-sparkbars__labels"
  }, labels.map((l, i) => /*#__PURE__*/React.createElement("span", {
    key: i
  }, l))));
}
Object.assign(__ds_scope, { SparkBars });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/SparkBars.jsx", error: String((e && e.message) || e) }); }

// components/data/Timeline.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Timeline({
  steps = [],
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['ic-timeline', className].filter(Boolean).join(' ')
  }, rest), steps.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: s.title || i,
    className: 'ic-timeline__row is-' + (s.state || 'todo')
  }, /*#__PURE__*/React.createElement("div", {
    className: "ic-timeline__rail"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ic-timeline__dot"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: s.icon || (s.state === 'done' ? 'check' : 'radio_button_unchecked'),
    filled: s.state === 'done'
  })), i < steps.length - 1 && /*#__PURE__*/React.createElement("span", {
    className: "ic-timeline__line"
  })), /*#__PURE__*/React.createElement("div", {
    className: "ic-timeline__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ic-timeline__title"
  }, s.title), (s.meta || s.date) && /*#__PURE__*/React.createElement("div", {
    className: "ic-timeline__meta"
  }, [s.date, s.meta].filter(Boolean).join(' · '))))));
}
Object.assign(__ds_scope, { Timeline });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Timeline.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Alert.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const ALERT_ICONS = {
  info: 'info',
  success: 'check_circle',
  warning: 'warning',
  danger: 'error'
};
function Alert({
  tone = 'info',
  title,
  children,
  icon,
  onDismiss,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['ic-alert', 'is-' + tone, className].filter(Boolean).join(' '),
    role: "status"
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon || ALERT_ICONS[tone]
  }), /*#__PURE__*/React.createElement("div", null, title && /*#__PURE__*/React.createElement("div", {
    className: "ic-alert__title"
  }, title), children && /*#__PURE__*/React.createElement("div", {
    className: "ic-alert__body"
  }, children)), onDismiss && /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    className: "ic-alert__close",
    icon: "close",
    label: "Fechar",
    variant: "bare",
    size: "sm",
    onClick: onDismiss
  }));
}
Object.assign(__ds_scope, { Alert });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Alert.jsx", error: String((e && e.message) || e) }); }

// components/feedback/EmptyState.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function EmptyState({
  icon = 'inventory_2',
  title,
  children,
  action,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['ic-empty', className].filter(Boolean).join(' ')
  }, rest), /*#__PURE__*/React.createElement("span", {
    className: "ic-empty__icon"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon
  })), title && /*#__PURE__*/React.createElement("div", {
    className: "ic-empty__title"
  }, title), children && /*#__PURE__*/React.createElement("div", {
    className: "ic-empty__body"
  }, children), action);
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TOAST_ICONS = {
  info: 'info',
  success: 'check_circle',
  danger: 'error'
};
function Toast({
  tone = 'info',
  children,
  actionLabel,
  onAction,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['ic-toast', className].filter(Boolean).join(' '),
    role: "status"
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: TOAST_ICONS[tone],
    className: 'ic-toast__icon is-' + tone,
    filled: true
  }), /*#__PURE__*/React.createElement("span", null, children), actionLabel && /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "ic-toast__action",
    onClick: onAction
  }, actionLabel));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Tooltip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Tooltip({
  label,
  children,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    className: ['ic-tooltip', className].filter(Boolean).join(' ')
  }, rest), children, /*#__PURE__*/React.createElement("span", {
    className: "ic-tooltip__bubble",
    role: "tooltip"
  }, label));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Checkbox({
  label,
  radio = false,
  disabled = false,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: ['ic-check', radio ? 'is-radio' : '', disabled ? 'is-disabled' : '', className].filter(Boolean).join(' ')
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: radio ? 'radio' : 'checkbox',
    disabled: disabled
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "ic-check__box"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: radio ? 'circle' : 'check'
  })), label && /*#__PURE__*/React.createElement("span", null, label));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Input({
  label,
  hint,
  error,
  icon,
  required = false,
  pill = false,
  multiline = false,
  id,
  className = '',
  ...rest
}) {
  const fieldId = id || 'ic-' + (label || 'input').toString().toLowerCase().replace(/\s+/g, '-');
  const Tag = multiline ? 'textarea' : 'input';
  return /*#__PURE__*/React.createElement("div", {
    className: ['ic-field', className].filter(Boolean).join(' ')
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "ic-label",
    htmlFor: fieldId
  }, label, required && /*#__PURE__*/React.createElement("span", {
    className: "ic-label__req"
  }, "*")), /*#__PURE__*/React.createElement("div", {
    className: ['ic-inputwrap', icon ? 'has-icon' : ''].filter(Boolean).join(' ')
  }, icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon
  }), /*#__PURE__*/React.createElement(Tag, _extends({
    id: fieldId,
    className: ['ic-input', pill ? 'is-pill' : '', error ? 'is-invalid' : ''].filter(Boolean).join(' ')
  }, rest))), (error || hint) && /*#__PURE__*/React.createElement("span", {
    className: 'ic-hint' + (error ? ' is-error' : '')
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/SegmentedControl.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function SegmentedControl({
  options = [],
  value,
  onChange,
  accent = false,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['ic-seg', accent ? 'is-accent' : '', className].filter(Boolean).join(' '),
    role: "tablist"
  }, rest), options.map(o => {
    const val = typeof o === 'string' ? o : o.value;
    const text = typeof o === 'string' ? o : o.label;
    const icon = typeof o === 'string' ? null : o.icon;
    return /*#__PURE__*/React.createElement("button", {
      key: val,
      type: "button",
      role: "tab",
      "aria-selected": val === value,
      className: 'ic-seg__opt' + (val === value ? ' is-active' : ''),
      onClick: () => onChange && onChange(val)
    }, icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: icon
    }), text);
  }));
}
Object.assign(__ds_scope, { SegmentedControl });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/SegmentedControl.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Select({
  label,
  hint,
  error,
  options = [],
  required = false,
  id,
  className = '',
  children,
  ...rest
}) {
  const fieldId = id || 'ic-' + (label || 'select').toString().toLowerCase().replace(/\s+/g, '-');
  return /*#__PURE__*/React.createElement("div", {
    className: ['ic-field', className].filter(Boolean).join(' ')
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "ic-label",
    htmlFor: fieldId
  }, label, required && /*#__PURE__*/React.createElement("span", {
    className: "ic-label__req"
  }, "*")), /*#__PURE__*/React.createElement("div", {
    className: "ic-selectwrap"
  }, /*#__PURE__*/React.createElement("select", _extends({
    id: fieldId,
    className: "ic-select"
  }, rest), children || options.map(o => {
    const value = typeof o === 'string' ? o : o.value;
    const text = typeof o === 'string' ? o : o.label;
    return /*#__PURE__*/React.createElement("option", {
      key: value,
      value: value
    }, text);
  })), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "expand_more"
  })), (error || hint) && /*#__PURE__*/React.createElement("span", {
    className: 'ic-hint' + (error ? ' is-error' : '')
  }, error || hint));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Switch({
  label,
  disabled = false,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: ['ic-switch', disabled ? 'is-disabled' : '', className].filter(Boolean).join(' ')
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    role: "switch",
    disabled: disabled
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "ic-switch__track"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ic-switch__thumb"
  })), label && /*#__PURE__*/React.createElement("span", null, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Breadcrumbs.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Breadcrumbs({
  items = [],
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("nav", _extends({
    className: ['ic-crumbs', className].filter(Boolean).join(' '),
    "aria-label": "Breadcrumb"
  }, rest), items.map((it, i) => {
    const last = i === items.length - 1;
    const text = typeof it === 'string' ? it : it.label;
    const href = typeof it === 'string' ? null : it.href;
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: text
    }, last ? /*#__PURE__*/React.createElement("span", {
      className: "ic-crumbs__current"
    }, text) : /*#__PURE__*/React.createElement("a", {
      href: href || '#'
    }, text), !last && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: "chevron_right",
      className: "ic-crumbs__sep"
    }));
  }));
}
Object.assign(__ds_scope, { Breadcrumbs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Breadcrumbs.jsx", error: String((e && e.message) || e) }); }

// components/navigation/NavPills.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function NavPills({
  items = [],
  value,
  onChange,
  accent = false,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("nav", _extends({
    className: ['ic-navpill', accent ? 'is-accent' : '', className].filter(Boolean).join(' ')
  }, rest), items.map(it => {
    const val = typeof it === 'string' ? it : it.value;
    const text = typeof it === 'string' ? it : it.label;
    const icon = typeof it === 'string' ? null : it.icon;
    return /*#__PURE__*/React.createElement("button", {
      key: val,
      type: "button",
      className: 'ic-navpill__item' + (val === value ? ' is-active' : ''),
      onClick: () => onChange && onChange(val)
    }, icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: icon
    }), text);
  }));
}
Object.assign(__ds_scope, { NavPills });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/NavPills.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SideNav.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function SideNav({
  items = [],
  value,
  onChange,
  collapsed = false,
  header,
  footer,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("aside", _extends({
    className: ['ic-sidenav', collapsed ? 'is-collapsed' : '', className].filter(Boolean).join(' ')
  }, rest), header, items.map((it, i) => it.group ? /*#__PURE__*/React.createElement("div", {
    key: 'g' + i,
    className: "ic-sidenav__group"
  }, it.group) : /*#__PURE__*/React.createElement("button", {
    key: it.value,
    type: "button",
    className: 'ic-sidenav__item' + (it.value === value ? ' is-active' : ''),
    onClick: () => onChange && onChange(it.value)
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: it.icon,
    filled: it.value === value
  }), /*#__PURE__*/React.createElement("span", {
    className: "ic-sidenav__label"
  }, it.label), it.count != null && /*#__PURE__*/React.createElement("span", {
    className: "ic-sidenav__count"
  }, it.count))), footer);
}
Object.assign(__ds_scope, { SideNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SideNav.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Tabs({
  items = [],
  value,
  onChange,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['ic-tabs', className].filter(Boolean).join(' '),
    role: "tablist"
  }, rest), items.map(it => {
    const val = typeof it === 'string' ? it : it.value;
    const text = typeof it === 'string' ? it : it.label;
    const icon = typeof it === 'string' ? null : it.icon;
    const badge = typeof it === 'string' ? null : it.badge;
    return /*#__PURE__*/React.createElement("button", {
      key: val,
      type: "button",
      role: "tab",
      "aria-selected": val === value,
      className: 'ic-tabs__item' + (val === value ? ' is-active' : ''),
      onClick: () => onChange && onChange(val)
    }, icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: icon,
      size: 19
    }), text, badge != null && /*#__PURE__*/React.createElement("span", {
      className: "ic-tabs__badge"
    }, badge));
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/navigation/TopBar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function TopBar({
  brand,
  center,
  actions,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("header", _extends({
    className: ['ic-topbar', className].filter(Boolean).join(' ')
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "ic-topbar__brand"
  }, brand), /*#__PURE__*/React.createElement("div", {
    className: "ic-topbar__spacer"
  }), center, /*#__PURE__*/React.createElement("div", {
    className: "ic-topbar__spacer"
  }), /*#__PURE__*/React.createElement("div", {
    className: "ic-topbar__actions"
  }, actions));
}
Object.assign(__ds_scope, { TopBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/TopBar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/AppShell.jsx
try { (() => {
const {
  TopBar,
  NavPills,
  SideNav,
  IconButton,
  Avatar,
  SegmentedControl,
  Icon
} = window.ImpoclickDesignSystem_ec37fd;
function ThemeToggle({
  theme,
  setTheme
}) {
  return /*#__PURE__*/React.createElement(SegmentedControl, {
    options: [{
      value: 'light',
      label: 'Claro',
      icon: 'light_mode'
    }, {
      value: 'dark',
      label: 'Escuro',
      icon: 'dark_mode'
    }],
    value: theme,
    onChange: setTheme
  });
}
function AppShell({
  route,
  setRoute,
  theme,
  setTheme,
  children
}) {
  const railTop = route;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100%',
      background: 'var(--surface-page)'
    }
  }, /*#__PURE__*/React.createElement(TopBar, {
    brand: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("img", {
      src: "../../assets/logo-impoclick.png",
      alt: ""
    }), "Impoclick"),
    center: /*#__PURE__*/React.createElement(NavPills, {
      items: [{
        value: 'painel',
        label: 'Painel'
      }, {
        value: 'importacoes',
        label: 'Importações'
      }, {
        value: 'cotacao',
        label: 'Cotação'
      }, {
        value: 'custos',
        label: 'Custos'
      }],
      value: route === 'embarque' ? 'importacoes' : route,
      onChange: setRoute
    }),
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(ThemeToggle, {
      theme: theme,
      setTheme: setTheme
    }), /*#__PURE__*/React.createElement(IconButton, {
      icon: "search",
      label: "Buscar",
      size: "sm"
    }), /*#__PURE__*/React.createElement(IconButton, {
      icon: "notifications",
      label: "Avisos",
      size: "sm"
    }), /*#__PURE__*/React.createElement(Avatar, {
      name: "Rafael Lima",
      size: "sm"
    }))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'stretch',
      minHeight: 'calc(100vh - var(--nav-height))'
    }
  }, /*#__PURE__*/React.createElement(SideNav, {
    value: railTop,
    onChange: setRoute,
    items: [{
      group: 'Operação'
    }, {
      value: 'painel',
      icon: 'dashboard',
      label: 'Painel'
    }, {
      value: 'importacoes',
      icon: 'inventory_2',
      label: 'Importações',
      count: 12
    }, {
      value: 'embarque',
      icon: 'directions_boat',
      label: 'Rastreio'
    }, {
      group: 'Comercial'
    }, {
      value: 'cotacao',
      icon: 'request_quote',
      label: 'Cotação'
    }, {
      value: 'fornecedores',
      icon: 'factory',
      label: 'Fornecedores',
      count: 27
    }, {
      group: 'Financeiro'
    }, {
      value: 'custos',
      icon: 'payments',
      label: 'Custos'
    }, {
      value: 'docs',
      icon: 'receipt_long',
      label: 'Documentos',
      count: 3
    }],
    footer: /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 'auto',
        paddingTop: 24
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        background: 'var(--surface-raised)',
        borderRadius: 'var(--radius-md)',
        padding: 14
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        color: 'var(--accent)',
        fontWeight: 600,
        fontSize: 13,
        marginBottom: 4
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "bolt",
      size: 18,
      filled: true
    }), "Plano Comex Pro"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: 'var(--text-muted)'
      }
    }, "18 de 40 cont\xEAineres usados neste m\xEAs.")))
  }), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      minWidth: 0,
      padding: '28px 32px 48px'
    }
  }, children)));
}
Object.assign(window, {
  AppShell,
  ThemeToggle
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/AppShell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/CostsScreen.jsx
try { (() => {
const {
  Card,
  Stat,
  DataTable,
  Badge,
  Button,
  SegmentedControl,
  SparkBars,
  ProgressBar,
  Breadcrumbs,
  IconButton
} = window.ImpoclickDesignSystem_ec37fd;
function CostsScreen() {
  const [period, setPeriod] = React.useState('12m');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      maxWidth: 1240,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement(Breadcrumbs, {
    items: [{
      label: 'Financeiro',
      href: '#'
    }, {
      label: 'Custos'
    }]
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 24,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--text-title-lg)'
    }
  }, "Custos de importa\xE7\xE3o"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: 'var(--text-muted)',
      marginTop: 4
    }
  }, "Custo desembarcado por processo, atualizado diariamente.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(SegmentedControl, {
    options: [{
      value: '30d',
      label: '30 dias'
    }, {
      value: '12m',
      label: '12 meses'
    }],
    value: period,
    onChange: setPeriod
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    iconLeft: "download"
  }, "Exportar CSV"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Card, {
    compact: true
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Custo desembarcado",
    prefix: "R$",
    value: "4.128.940",
    size: "sm",
    delta: "+6,8%",
    deltaNote: "vs. ano anterior"
  })), /*#__PURE__*/React.createElement(Card, {
    compact: true
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Custo m\xE9dio / cont\xEAiner",
    prefix: "R$",
    value: "31.280",
    size: "sm",
    delta: "-3,1%",
    deltaDirection: "down",
    deltaNote: "melhor"
  })), /*#__PURE__*/React.createElement(Card, {
    compact: true
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Impostos pagos",
    prefix: "R$",
    value: "1.402.110",
    size: "sm"
  })), /*#__PURE__*/React.createElement(Card, {
    compact: true
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Armazenagem evitada",
    prefix: "R$",
    value: "86.400",
    size: "sm",
    delta: "18 dias",
    deltaDirection: "flat"
  }))), /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Tend\xEAncia",
    title: "Custo desembarcado por m\xEAs"
  }, /*#__PURE__*/React.createElement(SparkBars, {
    height: 150,
    data: [286, 312, 274, 341, 388, 352, 401, 368, 392, 447, 376, 349],
    labels: ['Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set']
  })), /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Detalhe",
    title: "Por processo",
    action: /*#__PURE__*/React.createElement(IconButton, {
      icon: "tune",
      label: "Colunas",
      variant: "bare",
      size: "sm"
    })
  }, /*#__PURE__*/React.createElement(DataTable, {
    columns: [{
      key: 'id',
      label: 'Referência',
      primary: true
    }, {
      key: 'route',
      label: 'Rota'
    }, {
      key: 'fob',
      label: 'FOB',
      align: 'right'
    }, {
      key: 'freight',
      label: 'Frete',
      align: 'right'
    }, {
      key: 'tax',
      label: 'Impostos',
      align: 'right'
    }, {
      key: 'landed',
      label: 'Desembarcado',
      align: 'right'
    }, {
      key: 'margin',
      label: 'Margem',
      render: r => /*#__PURE__*/React.createElement("div", {
        style: {
          minWidth: 120
        }
      }, /*#__PURE__*/React.createElement(ProgressBar, {
        value: r.m,
        valueText: r.m + '%',
        tone: r.m > 35 ? 'success' : r.m > 22 ? 'accent' : 'danger'
      }))
    }],
    rows: [{
      id: 'IMP-2481',
      route: 'Shenzhen → Santos',
      fob: 'US$ 84.200',
      freight: 'R$ 62.900',
      tax: 'R$ 148.300',
      landed: 'R$ 612.480',
      m: 38
    }, {
      id: 'IMP-2479',
      route: 'Foshan → Santos',
      fob: 'US$ 31.980',
      freight: 'R$ 41.200',
      tax: 'R$ 62.700',
      landed: 'R$ 271.140',
      m: 27
    }, {
      id: 'IMP-2477',
      route: 'Yiwu → Paranaguá',
      fob: 'US$ 18.400',
      freight: 'R$ 38.900',
      tax: 'R$ 39.100',
      landed: 'R$ 183.620',
      m: 16
    }, {
      id: 'IMP-2470',
      route: 'Dongguan → Itajaí',
      fob: 'US$ 112.430',
      freight: 'R$ 74.400',
      tax: 'R$ 201.800',
      landed: 'R$ 842.010',
      m: 44
    }]
  })));
}
Object.assign(window, {
  CostsScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/CostsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/DashboardScreen.jsx
try { (() => {
const {
  Card,
  Stat,
  Badge,
  Button,
  IconButton,
  SegmentedControl,
  SparkBars,
  DonutMeter,
  Legend,
  Timeline,
  ProgressBar,
  Alert,
  Avatar,
  Icon
} = window.ImpoclickDesignSystem_ec37fd;
const costSegments = [{
  value: 46,
  color: 'var(--chart-1)',
  label: 'Frete internacional'
}, {
  value: 31,
  color: 'var(--chart-2)',
  label: 'Impostos'
}, {
  value: 14,
  color: 'var(--chart-3)',
  label: 'Armazenagem'
}, {
  value: 9,
  color: 'var(--chart-5)',
  label: 'Outros'
}];
function DashboardScreen({
  setRoute
}) {
  const [period, setPeriod] = React.useState('30d');
  const [currency, setCurrency] = React.useState('USD');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      maxWidth: 1240,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 24,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--text-muted)',
      fontWeight: 500
    }
  }, "Ter\xE7a, 16 de setembro"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--text-title-lg)',
      marginTop: 4
    }
  }, "Ol\xE1, Rafael")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(SegmentedControl, {
    options: [{
      value: '7d',
      label: '7 dias'
    }, {
      value: '30d',
      label: '30 dias'
    }, {
      value: '12m',
      label: '12 meses'
    }],
    value: period,
    onChange: setPeriod
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    iconLeft: "add"
  }, "Nova importa\xE7\xE3o"))), /*#__PURE__*/React.createElement(Alert, {
    tone: "warning",
    title: "2 embarques aguardam documentos"
  }, "A DI do IMP-2479 vence em 3 dias. Envie a fatura comercial para evitar armazenagem no porto de Santos."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))',
      gap: 16,
      alignItems: 'stretch'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    variant: "accent",
    eyebrow: "Valor em tr\xE2nsito",
    action: /*#__PURE__*/React.createElement(SegmentedControl, {
      options: ['USD', 'BRL'],
      value: currency,
      onChange: setCurrency
    })
  }, /*#__PURE__*/React.createElement(Stat, {
    prefix: currency === 'USD' ? 'US$' : 'R$',
    value: currency === 'USD' ? '1.284.600' : '6.873.610',
    fraction: ",00",
    delta: "+12,4%",
    deltaNote: "vs. per\xEDodo anterior",
    size: "lg"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    size: "sm",
    iconLeft: "download"
  }, "Extrato"), /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    size: "sm",
    iconLeft: "share"
  }, "Compartilhar"))), /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Cont\xEAineres",
    title: "Ocupa\xE7\xE3o do plano",
    action: /*#__PURE__*/React.createElement(IconButton, {
      icon: "arrow_outward",
      label: "Abrir",
      variant: "bare",
      size: "sm"
    })
  }, /*#__PURE__*/React.createElement(Stat, {
    value: "18",
    fraction: "/ 40",
    size: "md",
    delta: "+3",
    deltaNote: "nesta semana"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18
    }
  }, /*#__PURE__*/React.createElement(ProgressBar, {
    value: 18,
    max: 40,
    valueText: "45%",
    label: "Uso mensal"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginTop: 16,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "accent",
    dot: true
  }, "12 em tr\xE2nsito"), /*#__PURE__*/React.createElement(Badge, {
    tone: "warning",
    dot: true
  }, "4 no porto"), /*#__PURE__*/React.createElement(Badge, {
    tone: "success",
    dot: true
  }, "2 entregues"))), /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Composi\xE7\xE3o de custo",
    title: "\xDAltimos 30 dias",
    action: /*#__PURE__*/React.createElement(IconButton, {
      icon: "arrow_outward",
      label: "Abrir",
      variant: "bare",
      size: "sm"
    })
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 18,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(DonutMeter, {
    segments: costSegments,
    size: 132,
    thickness: 22,
    value: "US$ 84,2k",
    label: "Custo total"
  }), /*#__PURE__*/React.createElement(Legend, {
    items: costSegments,
    style: {
      flexDirection: 'column',
      gap: 8
    }
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)',
      gap: 16,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Volume",
    title: "Embarques por semana",
    action: /*#__PURE__*/React.createElement(SegmentedControl, {
      options: [{
        value: 's',
        label: 'Marítimo'
      }, {
        value: 'a',
        label: 'Aéreo'
      }],
      value: "s",
      onChange: () => {}
    })
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 10,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement(Stat, {
    value: "132",
    suffix: "cont\xEAineres",
    size: "sm",
    delta: "+8,1%",
    deltaNote: "vs. trimestre anterior"
  })), /*#__PURE__*/React.createElement(SparkBars, {
    data: [9, 14, 11, 18, 22, 16, 27, 19, 24, 31, 21, 17],
    height: 132,
    labels: ['Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set']
  })), /*#__PURE__*/React.createElement(Card, {
    eyebrow: "IMP-2481",
    title: "Shenzhen \u2192 Santos",
    action: /*#__PURE__*/React.createElement(IconButton, {
      icon: "arrow_outward",
      label: "Abrir embarque",
      variant: "bare",
      size: "sm",
      onClick: () => setRoute('embarque')
    })
  }, /*#__PURE__*/React.createElement(Timeline, {
    steps: [{
      title: 'Coleta no fornecedor',
      date: '02 abr',
      meta: 'Guangzhou',
      state: 'done',
      icon: 'factory'
    }, {
      title: 'Embarque · Shenzhen',
      date: '07 abr',
      meta: 'MSC Bianca',
      state: 'done',
      icon: 'directions_boat'
    }, {
      title: 'Em trânsito marítimo',
      date: 'prev. 29 abr',
      meta: '14 dias restantes',
      state: 'current',
      icon: 'public'
    }, {
      title: 'Desembaraço · Santos',
      state: 'todo',
      icon: 'gavel'
    }, {
      title: 'Entrega · Curitiba',
      state: 'todo',
      icon: 'local_shipping'
    }]
  }))), /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Equipe",
    title: "Atividade recente",
    compact: true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column'
    }
  }, [['Ana Sousa', 'anexou a fatura comercial em', 'IMP-2479', 'há 12 min'], ['Marcos Dias', 'aprovou a cotação de', 'Ningbo Tools Co.', 'há 1 h'], ['Rafael Lima', 'criou a importação', 'IMP-2483', 'ontem']].map(([who, what, ref, when], i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 0',
      borderTop: i ? '1px solid var(--border-subtle)' : 'none',
      fontSize: 14
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: who,
    size: "sm"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-body)'
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--text-title)',
      fontWeight: 600
    }
  }, who), " ", what, " ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--accent)',
      fontWeight: 600
    }
  }, ref)), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      fontSize: 12,
      color: 'var(--text-muted)'
    }
  }, when))))));
}
Object.assign(window, {
  DashboardScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/DashboardScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/ImportsScreen.jsx
try { (() => {
const {
  Card,
  Tabs,
  DataTable,
  Badge,
  Button,
  IconButton,
  Input,
  Select,
  Tag,
  EmptyState,
  Avatar,
  Breadcrumbs
} = window.ImpoclickDesignSystem_ec37fd;
const ALL_ROWS = [{
  id: 'IMP-2481',
  code: 'MSKU 472 118-3',
  supplier: 'Shenzhen Vitec',
  origin: 'Shenzhen',
  status: 'Em trânsito',
  tone: 'accent',
  eta: '29 abr',
  value: 'US$ 84.200',
  bucket: 'transit'
}, {
  id: 'IMP-2483',
  code: 'TGHU 662 045-1',
  supplier: 'Ningbo Tools Co.',
  origin: 'Ningbo',
  status: 'Em trânsito',
  tone: 'accent',
  eta: '06 mai',
  value: 'US$ 42.710',
  bucket: 'transit'
}, {
  id: 'IMP-2479',
  code: 'TCLU 883 401-9',
  supplier: 'Foshan Home',
  origin: 'Foshan',
  status: 'Aguardando DI',
  tone: 'warning',
  eta: '18 abr',
  value: 'US$ 31.980',
  bucket: 'customs'
}, {
  id: 'IMP-2477',
  code: 'CAIU 190 338-7',
  supplier: 'Yiwu Trading',
  origin: 'Yiwu',
  status: 'Retido',
  tone: 'danger',
  eta: '—',
  value: 'US$ 18.400',
  bucket: 'customs'
}, {
  id: 'IMP-2470',
  code: 'HLXU 210 774-2',
  supplier: 'Dongguan Plast',
  origin: 'Dongguan',
  status: 'Entregue',
  tone: 'success',
  eta: '04 abr',
  value: 'US$ 112.430',
  bucket: 'done'
}, {
  id: 'IMP-2468',
  code: 'MSDU 774 902-5',
  supplier: 'Shenzhen Vitec',
  origin: 'Shenzhen',
  status: 'Entregue',
  tone: 'success',
  eta: '28 mar',
  value: 'US$ 66.150',
  bucket: 'done'
}];
function ImportsScreen({
  setRoute
}) {
  const [tab, setTab] = React.useState('all');
  const [q, setQ] = React.useState('');
  const [filters, setFilters] = React.useState(['Origem: China']);
  const rows = ALL_ROWS.filter(r => tab === 'all' || r.bucket === tab).filter(r => (r.id + r.supplier + r.code).toLowerCase().includes(q.toLowerCase()));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      maxWidth: 1240,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement(Breadcrumbs, {
    items: [{
      label: 'Operação',
      href: '#'
    }, {
      label: 'Importações'
    }]
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 24,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--text-title-lg)'
    }
  }, "Importa\xE7\xF5es"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: 'var(--text-muted)',
      marginTop: 4
    }
  }, "34 processos abertos \xB7 US$ 1,28 mi em tr\xE2nsito")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    iconLeft: "download"
  }, "Exportar"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    iconLeft: "add"
  }, "Nova importa\xE7\xE3o"))), /*#__PURE__*/React.createElement(Card, {
    compact: true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      alignItems: 'flex-end',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: '1 1 260px'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    pill: true,
    icon: "search",
    placeholder: "Buscar por refer\xEAncia, cont\xEAiner ou fornecedor",
    value: q,
    onChange: e => setQ(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 180
    }
  }, /*#__PURE__*/React.createElement(Select, {
    options: ['Todos os modais', 'Marítimo', 'Aéreo']
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 180
    }
  }, /*#__PURE__*/React.createElement(Select, {
    options: ['Últimos 90 dias', 'Este mês', 'Este ano']
  })), /*#__PURE__*/React.createElement(IconButton, {
    icon: "tune",
    label: "Mais filtros"
  })), filters.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginTop: 14,
      flexWrap: 'wrap',
      alignItems: 'center'
    }
  }, filters.map(t => /*#__PURE__*/React.createElement(Tag, {
    key: t,
    onRemove: () => setFilters(filters.filter(x => x !== t))
  }, t)), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    onClick: () => setFilters([])
  }, "Limpar"))), /*#__PURE__*/React.createElement(Card, {
    style: {
      padding: '20px 8px 8px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px'
    }
  }, /*#__PURE__*/React.createElement(Tabs, {
    value: tab,
    onChange: setTab,
    items: [{
      value: 'all',
      label: 'Todas',
      badge: ALL_ROWS.length
    }, {
      value: 'transit',
      label: 'Em trânsito',
      badge: 2
    }, {
      value: 'customs',
      label: 'Desembaraço',
      badge: 2
    }, {
      value: 'done',
      label: 'Concluídas',
      badge: 2
    }]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18
    }
  }, rows.length === 0 ? /*#__PURE__*/React.createElement(EmptyState, {
    icon: "search_off",
    title: "Nenhuma importa\xE7\xE3o encontrada",
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "outline",
      size: "sm",
      onClick: () => {
        setQ('');
        setTab('all');
      }
    }, "Limpar busca")
  }, "Ajuste o per\xEDodo, o status ou o termo buscado.") : /*#__PURE__*/React.createElement(DataTable, {
    columns: [{
      key: 'id',
      label: 'Referência',
      primary: true
    }, {
      key: 'code',
      label: 'Contêiner',
      render: r => /*#__PURE__*/React.createElement("span", {
        className: "ic-mono"
      }, r.code)
    }, {
      key: 'supplier',
      label: 'Fornecedor',
      render: r => /*#__PURE__*/React.createElement("span", {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8
        }
      }, /*#__PURE__*/React.createElement(Avatar, {
        name: r.supplier,
        size: "xs"
      }), r.supplier)
    }, {
      key: 'origin',
      label: 'Origem'
    }, {
      key: 'status',
      label: 'Status',
      render: r => /*#__PURE__*/React.createElement(Badge, {
        tone: r.tone,
        dot: true
      }, r.status)
    }, {
      key: 'eta',
      label: 'ETA'
    }, {
      key: 'value',
      label: 'Valor FOB',
      align: 'right'
    }, {
      key: 'go',
      label: '',
      render: r => /*#__PURE__*/React.createElement(IconButton, {
        icon: "arrow_outward",
        label: 'Abrir ' + r.id,
        variant: "bare",
        size: "sm",
        onClick: () => setRoute('embarque')
      })
    }],
    rows: rows
  }))));
}
Object.assign(window, {
  ImportsScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/ImportsScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/QuoteScreen.jsx
try { (() => {
const {
  Card,
  Input,
  Select,
  Checkbox,
  Switch,
  SegmentedControl,
  Button,
  Stat,
  Badge,
  Breadcrumbs,
  DonutMeter,
  Legend,
  Toast,
  Icon
} = window.ImpoclickDesignSystem_ec37fd;
const quoteSegments = [{
  value: 44,
  color: 'var(--chart-1)',
  label: 'Frete'
}, {
  value: 34,
  color: 'var(--chart-2)',
  label: 'Impostos'
}, {
  value: 12,
  color: 'var(--chart-3)',
  label: 'Despacho'
}, {
  value: 10,
  color: 'var(--chart-5)',
  label: 'Seguro e taxas'
}];
function QuoteScreen() {
  const [modal, setModal] = React.useState('sea');
  const [incoterm, setIncoterm] = React.useState('FOB');
  const [sent, setSent] = React.useState(false);
  const total = modal === 'sea' ? '86.400' : '142.900';
  const days = modal === 'sea' ? '32' : '9';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      maxWidth: 1080,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement(Breadcrumbs, {
    items: [{
      label: 'Comercial',
      href: '#'
    }, {
      label: 'Nova cotação'
    }]
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--text-title-lg)'
    }
  }, "Nova cota\xE7\xE3o"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: 'var(--text-muted)',
      marginTop: 4
    }
  }, "Simule o custo total antes de fechar com o fornecedor.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1.45fr) minmax(0,1fr)',
      gap: 16,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Etapa 1",
    title: "Origem e destino"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Select, {
    label: "Porto de origem",
    options: ['Shenzhen (CNSZX)', 'Ningbo (CNNGB)', 'Xangai (CNSHA)']
  }), /*#__PURE__*/React.createElement(Select, {
    label: "Porto de destino",
    options: ['Santos (BRSSZ)', 'Paranaguá (BRPNG)', 'Itajaí (BRITJ)']
  }), /*#__PURE__*/React.createElement(Select, {
    label: "Fornecedor",
    options: ['Shenzhen Vitec', 'Ningbo Tools Co.', 'Foshan Home']
  }), /*#__PURE__*/React.createElement(Select, {
    label: "Incoterm",
    value: incoterm,
    onChange: e => setIncoterm(e.target.value),
    options: ['FOB', 'EXW', 'CIF', 'DDP']
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18,
      display: 'flex',
      gap: 12,
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--text-title)'
    }
  }, "Modal"), /*#__PURE__*/React.createElement(SegmentedControl, {
    accent: true,
    value: modal,
    onChange: setModal,
    options: [{
      value: 'sea',
      label: 'Marítimo',
      icon: 'directions_boat'
    }, {
      value: 'air',
      label: 'Aéreo',
      icon: 'flight'
    }]
  }))), /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Etapa 2",
    title: "Carga"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 1fr',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "Valor FOB (US$)",
    placeholder: "84.200,00",
    icon: "payments",
    required: true
  }), /*#__PURE__*/React.createElement(Input, {
    label: "Peso bruto (kg)",
    placeholder: "18.420",
    icon: "scale",
    required: true
  }), /*#__PURE__*/React.createElement(Input, {
    label: "Volume (m\xB3)",
    placeholder: "58,4",
    icon: "deployed_code"
  }), /*#__PURE__*/React.createElement(Input, {
    label: "NCM principal",
    placeholder: "8518.30.00",
    icon: "tag",
    hint: "Usada para estimar II e IPI"
  }), /*#__PURE__*/React.createElement(Select, {
    label: "Tipo de cont\xEAiner",
    options: ['40" HC', '20" DV', 'LCL (carga solta)']
  }), /*#__PURE__*/React.createElement(Input, {
    label: "Quantidade",
    placeholder: "1",
    icon: "inventory_2"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 24,
      marginTop: 20,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Checkbox, {
    label: "Incluir seguro internacional",
    defaultChecked: true
  }), /*#__PURE__*/React.createElement(Checkbox, {
    label: "Carga perigosa (IMO)"
  }), /*#__PURE__*/React.createElement(Switch, {
    label: "Entrega porta a porta",
    defaultChecked: true
  })))), /*#__PURE__*/React.createElement(Card, {
    variant: "accent",
    eyebrow: "Estimativa",
    title: "Custo desembarcado",
    style: {
      position: 'sticky',
      top: 'calc(var(--nav-height) + 20px)'
    }
  }, /*#__PURE__*/React.createElement(Stat, {
    prefix: "US$",
    value: total,
    fraction: ",00",
    size: "md"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      margin: '16px 0 20px',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "neutral",
    icon: "schedule"
  }, days, " dias porta a porta"), /*#__PURE__*/React.createElement(Badge, {
    tone: "neutral"
  }, incoterm)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 16,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(DonutMeter, {
    segments: quoteSegments,
    size: 118,
    thickness: 20
  }), /*#__PURE__*/React.createElement(Legend, {
    items: quoteSegments,
    style: {
      flexDirection: 'column',
      gap: 7
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      marginTop: 22
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    block: true,
    iconRight: "arrow_outward",
    onClick: () => setSent(true)
  }, "Solicitar cota\xE7\xE3o firme"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    block: true
  }, "Salvar rascunho")))), sent && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      left: 32,
      bottom: 28,
      zIndex: 80
    }
  }, /*#__PURE__*/React.createElement(Toast, {
    tone: "success",
    actionLabel: "Desfazer",
    onAction: () => setSent(false)
  }, "Cota\xE7\xE3o enviada para 3 agentes de carga.")));
}
Object.assign(window, {
  QuoteScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/QuoteScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/ShipmentScreen.jsx
try { (() => {
const {
  Card,
  Stat,
  Badge,
  Button,
  IconButton,
  Timeline,
  ProgressBar,
  DataTable,
  Breadcrumbs,
  Tabs,
  Alert,
  Avatar,
  Icon,
  Tooltip
} = window.ImpoclickDesignSystem_ec37fd;
function ShipmentScreen({
  setRoute
}) {
  const [tab, setTab] = React.useState('rota');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      maxWidth: 1240,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement(Breadcrumbs, {
    items: [{
      label: 'Importações',
      href: '#'
    }, {
      label: 'IMP-2481'
    }]
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 24,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--text-title-lg)'
    }
  }, "Shenzhen \u2192 Santos"), /*#__PURE__*/React.createElement(Badge, {
    tone: "accent",
    dot: true
  }, "Em tr\xE2nsito")), /*#__PURE__*/React.createElement("p", {
    className: "ic-mono",
    style: {
      fontSize: 13,
      color: 'var(--text-muted)',
      marginTop: 6
    }
  }, "IMP-2481 \xB7 MSKU 472 118-3 \xB7 BL SZX0482914")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Tooltip, {
    label: "Baixar documentos"
  }, /*#__PURE__*/React.createElement(IconButton, {
    icon: "download",
    label: "Baixar"
  })), /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    iconLeft: "chat"
  }, "Falar com o despachante"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    iconLeft: "upload_file"
  }, "Enviar documento"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Card, {
    compact: true
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Valor FOB",
    prefix: "US$",
    value: "84.200",
    fraction: ",00",
    size: "sm"
  })), /*#__PURE__*/React.createElement(Card, {
    compact: true
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Custo total estimado",
    prefix: "R$",
    value: "612.480",
    fraction: ",00",
    size: "sm",
    delta: "+4,2%",
    deltaDirection: "up",
    deltaNote: "vs. cota\xE7\xE3o"
  })), /*#__PURE__*/React.createElement(Card, {
    compact: true
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Peso bruto",
    value: "18.420",
    suffix: "kg",
    size: "sm"
  })), /*#__PURE__*/React.createElement(Card, {
    compact: true
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Chegada prevista",
    value: "29",
    suffix: "abr",
    size: "sm",
    delta: "14 dias",
    deltaDirection: "flat"
  }))), /*#__PURE__*/React.createElement(Alert, {
    tone: "info",
    title: "Rastreio atualizado h\xE1 22 minutos"
  }, "\xDAltima posi\xE7\xE3o informada pela MSC: 12\xB044\u2032S 38\xB030\u2032W, velocidade 16,4 n\xF3s."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
      gap: 16,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Trajeto",
    title: "Etapas do embarque"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement(ProgressBar, {
    thick: true,
    label: "Progresso do trajeto",
    valueText: "18 / 32 dias",
    value: 18,
    max: 32
  })), /*#__PURE__*/React.createElement(Timeline, {
    steps: [{
      title: 'Pedido confirmado',
      date: '24 mar',
      meta: 'Shenzhen Vitec',
      state: 'done',
      icon: 'handshake'
    }, {
      title: 'Coleta no fornecedor',
      date: '02 abr',
      meta: 'Guangzhou',
      state: 'done',
      icon: 'factory'
    }, {
      title: 'Embarque · Shenzhen',
      date: '07 abr',
      meta: 'MSC Bianca · Viagem 418W',
      state: 'done',
      icon: 'directions_boat'
    }, {
      title: 'Em trânsito marítimo',
      date: 'prev. 29 abr',
      meta: 'Atlântico Sul · 14 dias restantes',
      state: 'current',
      icon: 'public'
    }, {
      title: 'Atracação · Santos',
      state: 'todo',
      icon: 'anchor'
    }, {
      title: 'Desembaraço aduaneiro',
      state: 'todo',
      icon: 'gavel'
    }, {
      title: 'Entrega · Curitiba',
      state: 'todo',
      icon: 'local_shipping'
    }]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Card, {
    style: {
      padding: '20px 8px 8px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px'
    }
  }, /*#__PURE__*/React.createElement(Tabs, {
    value: tab,
    onChange: setTab,
    items: [{
      value: 'rota',
      label: 'Itens',
      badge: 3
    }, {
      value: 'docs',
      label: 'Documentos',
      badge: 5
    }]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, tab === 'rota' ? /*#__PURE__*/React.createElement(DataTable, {
    columns: [{
      key: 'item',
      label: 'Produto',
      primary: true
    }, {
      key: 'ncm',
      label: 'NCM',
      render: r => /*#__PURE__*/React.createElement("span", {
        className: "ic-mono"
      }, r.ncm)
    }, {
      key: 'qty',
      label: 'Qtd.',
      align: 'right'
    }, {
      key: 'total',
      label: 'Total FOB',
      align: 'right'
    }],
    rows: [{
      item: 'Fone bluetooth TWS',
      ncm: '8518.30.00',
      qty: '4.800',
      total: 'US$ 38.400'
    }, {
      item: 'Carregador 65W GaN',
      ncm: '8504.40.90',
      qty: '3.200',
      total: 'US$ 28.800'
    }, {
      item: 'Cabo USB-C 2 m',
      ncm: '8544.42.00',
      qty: '9.000',
      total: 'US$ 17.000'
    }]
  }) : /*#__PURE__*/React.createElement(DataTable, {
    columns: [{
      key: 'doc',
      label: 'Documento',
      primary: true
    }, {
      key: 'who',
      label: 'Enviado por',
      render: r => /*#__PURE__*/React.createElement("span", {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8
        }
      }, /*#__PURE__*/React.createElement(Avatar, {
        name: r.who,
        size: "xs"
      }), r.who)
    }, {
      key: 'status',
      label: 'Status',
      render: r => /*#__PURE__*/React.createElement(Badge, {
        tone: r.tone,
        dot: true
      }, r.status)
    }],
    rows: [{
      doc: 'Commercial Invoice',
      who: 'Ana Sousa',
      status: 'Aprovado',
      tone: 'success'
    }, {
      doc: 'Packing List',
      who: 'Ana Sousa',
      status: 'Aprovado',
      tone: 'success'
    }, {
      doc: 'Bill of Lading',
      who: 'MSC',
      status: 'Aprovado',
      tone: 'success'
    }, {
      doc: 'Certificado de origem',
      who: 'Shenzhen Vitec',
      status: 'Em análise',
      tone: 'warning'
    }, {
      doc: 'Licença de importação',
      who: '—',
      status: 'Pendente',
      tone: 'neutral'
    }]
  }))), /*#__PURE__*/React.createElement(Card, {
    variant: "invert",
    eyebrow: "Parceiro",
    title: "Shenzhen Vitec Electronics",
    action: /*#__PURE__*/React.createElement(IconButton, {
      icon: "arrow_outward",
      label: "Abrir fornecedor",
      variant: "bare",
      size: "sm"
    })
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      marginTop: 8,
      flexWrap: 'wrap'
    }
  }, [['Embarques', '14'], ['Prazo médio', '31 d'], ['Avarias', '0,4%']].map(([k, v]) => /*#__PURE__*/React.createElement("div", {
    key: k
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'rgba(255,255,255,.6)'
    }
  }, k), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 24,
      fontWeight: 600,
      letterSpacing: '-.02em',
      color: '#fff',
      fontVariantNumeric: 'tabular-nums'
    }
  }, v))))))));
}
Object.assign(window, {
  ShipmentScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/ShipmentScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/site/SiteBody.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  Button,
  Card,
  Stat,
  Badge,
  Icon,
  Input,
  Timeline,
  Avatar,
  IconButton
} = window.ImpoclickDesignSystem_ec37fd;
const siteFeatures = [{
  icon: 'radar',
  title: 'Rastreio em tempo real',
  body: 'Posição do navio, ETA recalculada e alerta quando o contêiner atraca — sem abrir o site da armadora.'
}, {
  icon: 'calculate',
  title: 'Custo desembarcado',
  body: 'II, IPI, PIS, COFINS, ICMS, frete e armazenagem calculados por NCM antes de você fechar o pedido.'
}, {
  icon: 'description',
  title: 'Documentos num lugar só',
  body: 'Invoice, packing list, BL e certificados anexados ao processo e compartilhados com o despachante.'
}, {
  icon: 'factory',
  title: 'Histórico por fornecedor',
  body: 'Prazo médio, índice de avaria e divergências de NCM de cada fábrica com quem você já trabalhou.'
}, {
  icon: 'notifications_active',
  title: 'Alertas que evitam custo',
  body: 'Avisos de vencimento de DI e de free time para você não pagar armazenagem por esquecimento.'
}, {
  icon: 'group',
  title: 'Time e despachante juntos',
  body: 'Comentários e aprovações no próprio processo. Ninguém mais procura o anexo no WhatsApp.'
}];
function Features() {
  return /*#__PURE__*/React.createElement(Section, null, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: '54ch',
      marginBottom: 48
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Plataforma"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 'clamp(30px,4vw,44px)',
      letterSpacing: '-.03em',
      lineHeight: 1.1,
      marginTop: 20
    }
  }, "Seis planilhas, tr\xEAs grupos de WhatsApp e um despachante \u2014 substitu\xEDdos por uma tela.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))',
      gap: 16
    }
  }, siteFeatures.map(f => /*#__PURE__*/React.createElement(Card, {
    key: f.title,
    interactive: true
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      width: 46,
      height: 46,
      borderRadius: 14,
      background: 'var(--accent-soft)',
      color: 'var(--accent)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: f.icon,
    size: 24
  })), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 19,
      marginBottom: 8
    }
  }, f.title), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 15,
      color: 'var(--text-muted)',
      lineHeight: 1.5
    }
  }, f.body)))));
}
function HowItWorks() {
  return /*#__PURE__*/React.createElement(Section, {
    style: {
      background: 'var(--surface-card)',
      borderTop: '1px solid var(--border-subtle)',
      borderBottom: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
      gap: 64,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Eyebrow, null, "Como funciona"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 'clamp(30px,4vw,44px)',
      letterSpacing: '-.03em',
      lineHeight: 1.1,
      margin: '20px 0 20px'
    }
  }, "Do pedido \xE0 sua porta, com quatro paradas vis\xEDveis."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 17,
      color: 'var(--text-muted)',
      lineHeight: 1.55,
      marginBottom: 28
    }
  }, "Voc\xEA cadastra a cota\xE7\xE3o uma vez. A partir da\xED a Impoclick puxa o status da armadora, calcula o custo e avisa o seu time a cada etapa."), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    iconRight: "arrow_outward"
  }, "Come\xE7ar uma cota\xE7\xE3o")), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(Timeline, {
    steps: [{
      title: 'Cote com 3 agentes',
      date: 'dia 0',
      meta: 'Modal, incoterm e NCM em um formulário',
      state: 'done',
      icon: 'request_quote'
    }, {
      title: 'Feche com o fornecedor',
      date: 'dia 4',
      meta: 'Documentos anexados ao processo',
      state: 'done',
      icon: 'handshake'
    }, {
      title: 'Acompanhe o trajeto',
      date: 'dia 7–39',
      meta: 'Posição e ETA atualizadas todo dia',
      state: 'current',
      icon: 'directions_boat'
    }, {
      title: 'Receba com o custo fechado',
      date: 'dia 42',
      meta: 'Custo desembarcado por item',
      state: 'todo',
      icon: 'local_shipping'
    }]
  }))));
}
function Numbers() {
  return /*#__PURE__*/React.createElement(Section, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))',
      gap: 16
    }
  }, [{
    label: 'Contêineres acompanhados',
    value: '12.480',
    delta: '+31%',
    note: 'em 2026'
  }, {
    label: 'Economia média em armazenagem',
    prefix: 'R$',
    value: '14.200',
    note: 'por processo'
  }, {
    label: 'Dias a menos no desembaraço',
    value: '3,4',
    suffix: 'dias'
  }, {
    label: 'Importadores ativos',
    value: '640',
    delta: '+18%'
  }].map(s => /*#__PURE__*/React.createElement(Card, {
    key: s.label,
    variant: "flat"
  }, /*#__PURE__*/React.createElement(Stat, _extends({}, s, {
    deltaNote: s.note,
    size: "sm"
  }))))));
}
function Testimonial() {
  return /*#__PURE__*/React.createElement(Section, {
    style: {
      paddingTop: 0
    }
  }, /*#__PURE__*/React.createElement(Card, {
    variant: "invert",
    style: {
      padding: 56
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: '46ch'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "format_quote",
    size: 40,
    style: {
      color: 'var(--aqua-400)'
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 'clamp(22px,2.6vw,30px)',
      lineHeight: 1.35,
      letterSpacing: '-.02em',
      color: '#fff',
      fontWeight: 500,
      margin: '12px 0 28px'
    }
  }, "Antes eu descobria a armazenagem na fatura. Agora eu recebo o aviso sete dias antes e resolvo com o despachante no mesmo dia."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: "Camila Prado",
    size: "md",
    accent: true
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#fff',
      fontWeight: 600,
      fontSize: 15
    }
  }, "Camila Prado"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'rgba(255,255,255,.62)',
      fontSize: 13
    }
  }, "Head de Suprimentos \xB7 Vertta Eletro"))))));
}
function CTA({
  onEnter
}) {
  return /*#__PURE__*/React.createElement(Section, {
    style: {
      paddingTop: 0
    }
  }, /*#__PURE__*/React.createElement(Card, {
    variant: "accent",
    style: {
      padding: 56,
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 'clamp(28px,4vw,42px)',
      letterSpacing: '-.03em',
      lineHeight: 1.1,
      maxWidth: '20ch',
      margin: '0 auto'
    }
  }, "Acompanhe o seu pr\xF3ximo cont\xEAiner sem custo"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 17,
      margin: '16px auto 28px',
      maxWidth: '52ch',
      color: 'color-mix(in oklab, var(--text-on-accent) 78%, transparent)'
    }
  }, "Cadastre um processo em andamento e veja o custo desembarcado em menos de dez minutos."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      justifyContent: 'center',
      flexWrap: 'wrap',
      maxWidth: 480,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: '1 1 240px'
    }
  }, /*#__PURE__*/React.createElement(Input, {
    pill: true,
    placeholder: "seu@email.com.br",
    icon: "mail"
  })), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "md",
    iconRight: "arrow_outward",
    onClick: onEnter
  }, "Come\xE7ar"))));
}
function SiteFooter() {
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: 'var(--surface-card)',
      borderTop: '1px solid var(--border-subtle)',
      padding: '56px 32px 32px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1.4fr) repeat(3,minmax(0,1fr))',
      gap: 40
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-impoclick.png",
    alt: "",
    style: {
      width: 30,
      height: 30
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 19,
      fontWeight: 700,
      letterSpacing: '-.025em',
      color: 'var(--text-title)'
    }
  }, "Impoclick")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 14,
      color: 'var(--text-muted)',
      maxWidth: '34ch',
      lineHeight: 1.5
    }
  }, "Plataforma brasileira de gest\xE3o de importa\xE7\xE3o. Do pedido ao custo desembarcado.")), [['Produto', ['Plataforma', 'Rastreio', 'Custos', 'Integrações']], ['Empresa', ['Sobre', 'Carreiras', 'Contato']], ['Recursos', ['Central de ajuda', 'Guia de NCM', 'Status', 'Privacidade']]].map(([title, links]) => /*#__PURE__*/React.createElement("div", {
    key: title
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '.12em',
      fontWeight: 600,
      color: 'var(--text-muted)',
      marginBottom: 14
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, links.map(l => /*#__PURE__*/React.createElement("a", {
    key: l,
    href: "#",
    style: {
      fontSize: 14,
      color: 'var(--text-body)',
      textDecoration: 'none'
    }
  }, l)))))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '40px auto 0',
      paddingTop: 20,
      borderTop: '1px solid var(--border-subtle)',
      display: 'flex',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap',
      fontSize: 13,
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", null, "\xA9 2026 Impoclick Tecnologia Ltda. \xB7 CNPJ 00.000.000/0001-00"), /*#__PURE__*/React.createElement("span", null, "S\xE3o Paulo \xB7 Brasil")));
}
Object.assign(window, {
  Features,
  HowItWorks,
  Numbers,
  Testimonial,
  CTA,
  SiteFooter
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/site/SiteBody.jsx", error: String((e && e.message) || e) }); }

// ui_kits/site/SiteSections.jsx
try { (() => {
const {
  Button,
  IconButton,
  Badge,
  Card,
  Stat,
  Icon,
  Input,
  SegmentedControl,
  Timeline,
  Tag,
  Avatar
} = window.ImpoclickDesignSystem_ec37fd;
function Eyebrow({
  children
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      height: 32,
      padding: '0 14px',
      borderRadius: 'var(--radius-pill)',
      background: 'var(--accent-soft)',
      border: '1px solid var(--accent-soft-border)',
      color: 'var(--accent)',
      fontSize: 13,
      fontWeight: 600
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: 'currentColor'
    }
  }), children);
}
function Section({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      padding: '96px 32px',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto'
    }
  }, children));
}
function SiteHeader({
  onEnter
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: 'sticky',
      top: 0,
      zIndex: 50,
      background: 'var(--veil-light)',
      backdropFilter: 'var(--blur-bar)',
      WebkitBackdropFilter: 'var(--blur-bar)',
      borderBottom: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-wide)',
      margin: '0 auto',
      height: 72,
      padding: '0 32px',
      display: 'flex',
      alignItems: 'center',
      gap: 32
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      textDecoration: 'none'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-impoclick.png",
    alt: "",
    style: {
      width: 34,
      height: 34
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 21,
      fontWeight: 700,
      letterSpacing: '-.025em',
      color: 'var(--text-title)'
    }
  }, "Impoclick")), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      gap: 26,
      marginLeft: 20
    }
  }, ['Plataforma', 'Como funciona', 'Preços', 'Casos'].map(l => /*#__PURE__*/React.createElement("a", {
    key: l,
    href: "#",
    style: {
      fontSize: 15,
      fontWeight: 500,
      color: 'var(--text-body)',
      textDecoration: 'none'
    }
  }, l))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 'auto',
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm"
  }, "Entrar"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    iconRight: "arrow_outward",
    onClick: onEnter
  }, "Abrir demonstra\xE7\xE3o"))));
}
function Hero({
  onEnter
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      position: 'relative',
      overflow: 'hidden',
      background: 'var(--surface-card)',
      borderBottom: '1px solid var(--border-subtle)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: -220,
      right: -120,
      width: 620,
      height: 620,
      borderRadius: '50%',
      background: 'radial-gradient(circle, color-mix(in oklab, var(--aqua-400) 26%, transparent) 0%, transparent 68%)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: -280,
      left: -160,
      width: 520,
      height: 520,
      borderRadius: '50%',
      background: 'radial-gradient(circle, color-mix(in oklab, var(--orange-400) 14%, transparent) 0%, transparent 70%)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '104px 32px 0',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement(Eyebrow, null, "Importa\xE7\xE3o da China, ponta a ponta"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'clamp(40px, 6vw, 72px)',
      lineHeight: 1.03,
      letterSpacing: '-.035em',
      fontWeight: 600,
      margin: '24px auto 0',
      maxWidth: 16 + 'ch'
    }
  }, "Todo o seu processo de importa\xE7\xE3o ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--accent)'
    }
  }, "em um clique")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 19,
      color: 'var(--text-muted)',
      maxWidth: '58ch',
      margin: '22px auto 0',
      lineHeight: 1.5
    }
  }, "Cota\xE7\xE3o, fornecedor, embarque, desembara\xE7o e custo desembarcado no mesmo painel. Voc\xEA v\xEA onde a carga est\xE1 e quanto ela custa \u2014 antes de ela chegar."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      justifyContent: 'center',
      margin: '32px 0 12px',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    iconRight: "arrow_outward",
    onClick: onEnter
  }, "Abrir demonstra\xE7\xE3o"), /*#__PURE__*/React.createElement(Button, {
    variant: "outline",
    size: "lg",
    iconLeft: "play_circle"
  }, "Ver em 2 minutos")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 13,
      color: 'var(--text-muted)'
    }
  }, "Sem cart\xE3o. Primeiro cont\xEAiner acompanhado gr\xE1tis."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 56,
      borderRadius: 'var(--radius-sheet) var(--radius-sheet) 0 0',
      border: '1px solid var(--border-subtle)',
      borderBottom: 'none',
      background: 'var(--surface-page)',
      boxShadow: 'var(--shadow-lg)',
      overflow: 'hidden',
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      borderBottom: '1px solid var(--border-subtle)',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '0 16px',
      background: 'var(--surface-card)'
    }
  }, ['var(--ink-300)', 'var(--ink-300)', 'var(--ink-300)'].map((c, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: c
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "ic-mono",
    style: {
      marginLeft: 12,
      fontSize: 12,
      color: 'var(--text-muted)'
    }
  }, "app.impoclick.com.br/painel")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 24,
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Card, {
    variant: "accent",
    eyebrow: "Valor em tr\xE2nsito",
    compact: true
  }, /*#__PURE__*/React.createElement(Stat, {
    prefix: "US$",
    value: "1.284.600",
    fraction: ",00",
    delta: "+12,4%",
    deltaNote: "vs. m\xEAs anterior",
    size: "sm"
  })), /*#__PURE__*/React.createElement(Card, {
    eyebrow: "IMP-2481",
    title: "Shenzhen \u2192 Santos",
    compact: true
  }, /*#__PURE__*/React.createElement(Timeline, {
    steps: [{
      title: 'Embarcado',
      date: '07 abr',
      state: 'done',
      icon: 'directions_boat'
    }, {
      title: 'Em trânsito',
      date: 'prev. 29 abr',
      state: 'current',
      icon: 'public'
    }, {
      title: 'Desembaraço',
      state: 'todo',
      icon: 'gavel'
    }]
  })), /*#__PURE__*/React.createElement(Card, {
    eyebrow: "Status da frota",
    compact: true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "accent",
    dot: true
  }, "12 em tr\xE2nsito"), /*#__PURE__*/React.createElement(Badge, {
    tone: "warning",
    dot: true
  }, "4 aguardando DI"), /*#__PURE__*/React.createElement(Badge, {
    tone: "success",
    dot: true
  }, "2 entregues esta semana"), /*#__PURE__*/React.createElement(Badge, {
    tone: "danger",
    dot: true
  }, "1 retido")))))));
}
function LogoStrip() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      borderBottom: '1px solid var(--border-subtle)',
      background: 'var(--surface-card)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-max)',
      margin: '0 auto',
      padding: '28px 32px',
      display: 'flex',
      alignItems: 'center',
      gap: 40,
      flexWrap: 'wrap',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--text-muted)'
    }
  }, "Operando com"), ['MSC', 'Maersk', 'COSCO', 'Hapag-Lloyd', 'CMA CGM', 'Receita Federal'].map(n => /*#__PURE__*/React.createElement("span", {
    key: n,
    style: {
      fontSize: 17,
      fontWeight: 600,
      letterSpacing: '-.02em',
      color: 'var(--ink-400)'
    }
  }, n))));
}
Object.assign(window, {
  Eyebrow,
  Section,
  SiteHeader,
  Hero,
  LogoStrip
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/site/SiteSections.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.AvatarGroup = __ds_scope.AvatarGroup;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.ProgressBar = __ds_scope.ProgressBar;

__ds_ns.Stat = __ds_scope.Stat;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.DataTable = __ds_scope.DataTable;

__ds_ns.DonutMeter = __ds_scope.DonutMeter;

__ds_ns.Legend = __ds_scope.Legend;

__ds_ns.SparkBars = __ds_scope.SparkBars;

__ds_ns.Timeline = __ds_scope.Timeline;

__ds_ns.Alert = __ds_scope.Alert;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.SegmentedControl = __ds_scope.SegmentedControl;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Breadcrumbs = __ds_scope.Breadcrumbs;

__ds_ns.NavPills = __ds_scope.NavPills;

__ds_ns.SideNav = __ds_scope.SideNav;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.TopBar = __ds_scope.TopBar;

})();
