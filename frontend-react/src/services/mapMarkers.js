export function pulsingMarker(map, position, color, { label, size = 18 } = {}) {
  class PulsingMarker extends google.maps.OverlayView {
    constructor() {
      super();
      this.position = position;
      this.div = null;
      this.setMap(map);
    }

    onAdd() {
      this.div = document.createElement('div');
      this.div.style.position = 'absolute';
      this.div.innerHTML = `<span class="pulsing-marker" style="--marker-color:${color};--marker-size:${size}px">`
        + '<span class="pulsing-marker__ring"></span>'
        + `<span class="pulsing-marker__dot">${label ?? ''}</span>`
        + '</span>';
      this.getPanes().overlayMouseTarget.appendChild(this.div);
    }

    draw() {
      const projection = this.getProjection();
      if (!projection || !this.div) return;
      const point = projection.fromLatLngToDivPixel(
        new google.maps.LatLng(this.position.lat, this.position.lng)
      );
      if (!point) return;
      this.div.style.left = `${point.x - size / 2}px`;
      this.div.style.top = `${point.y - size / 2}px`;
    }

    onRemove() {
      this.div?.remove();
      this.div = null;
    }

    setLatLng(pos) {
      this.position = pos;
      this.draw();
    }

    remove() {
      this.setMap(null);
    }
  }

  return new PulsingMarker();
}
