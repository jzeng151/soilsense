import { describe, expect, it } from 'vitest';
import { landingRedirect, locationFromHash } from './location';
describe('Explore navigation',()=>{
  it('leaves default planner navigation untouched when flag is off',()=>{
    for(const hash of ['', '#', '#/', '#/planner', '#/explore', '#/sources']) expect(landingRedirect(hash,false)).toBeNull();
  });
  it('redirects root only when enabled, preserving explicit planner and deep links',()=>{
    expect(landingRedirect('',true)).toBe('#/explore');
    expect(landingRedirect('#/',true)).toBe('#/explore');
    expect(landingRedirect('#/planner',true)).toBeNull();
    expect(landingRedirect('#/explore?lat=42&lon=-93',true)).toBeNull();
  });
  it('opens a demo location and rejects invalid coordinates',()=>{
    expect(locationFromHash('#/explore?lat=42.0563&lon=-93.495&label=Story')).toEqual({lat:42.0563,lon:-93.495,label:'Story'});
    expect(locationFromHash('#/explore?lat=oops&lon=0')).toBeNull();
    expect(locationFromHash('#/explore?lat=0')).toBeNull();
    expect(locationFromHash('#/explore?lat=91&lon=0')).toBeNull();
  });
});
